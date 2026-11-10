// The client area: a private file space per client, shared between that client and Ey-aye.
//
// Who can do what:
//   client  → see their own folders and files, download, upload, add and rename folders
//   admin   → all of that in any client's space, plus delete files and folders
// Admins are listed by member ID in ADMIN_MEMBER_IDS below.
//
// Storage:
//   CMS `ClientDocuments` → one row per file: title, memberId, fileId, fileName, folderId,
//                           uploadedBy ('client' | 'ey-aye'), sizeInBytes, mimeType, note, documentDate
//   CMS `ClientFolders`   → one row per folder: name, memberId, createdBy
//   Media Manager         → the files themselves, private, in client-documents/<memberId>/
// Both collections are admin-only, so a browser can't read them. Everything here runs on the server
// with elevated permissions, and every read and write is scoped to a member ID that comes from the
// signed-in session (or, for an admin, from the admin's own choice of client), never trusted as-is.
import { auth } from '@wix/essentials';
import { members } from '@wix/members';
import { items } from '@wix/data';
import { files, folders } from '@wix/media';
import { notify, SITE_URL } from './portal';

const DOCS = 'ClientDocuments';
const FOLDERS = 'ClientFolders';

/** Members who see every client's space and can delete. (Paul.) */
const ADMIN_MEMBER_IDS = new Set(['b351037b-5588-45bc-b1ec-8d3df4b1bdd6']);

/** Media Manager folder that holds one sub-folder per client. */
const MEDIA_ROOT_NAME = 'client-documents';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** What can be uploaded: extension → MIME type. The server picks the type, not the browser. */
export const ALLOWED_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  txt: 'text/plain',
  rtf: 'application/rtf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export const LOGIN_URL = '/api/auth/login?returnToUrl=/clients/';
export const LOGOUT_URL = '/api/auth/logout?returnToUrl=/';

export interface Client {
  id: string;
  /** The member's Wix contact (CRM, Inbox, Invoices and Pipelines all key on this). */
  contactId: string;
  name: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  email: string;
  isAdmin: boolean;
}

export interface Folder {
  id: string;
  name: string;
}

export interface ClientFile {
  id: string;
  title: string;
  fileName: string;
  folderId: string;
  /** 'client' or 'ey-aye'. Older rows have none: those were shared by Ey-aye. */
  uploadedBy: 'client' | 'ey-aye';
  sizeInBytes: number;
  note: string;
  /** YYYY-MM-DD */
  date: string;
  /** When the row was added (ISO), for "new since your last visit". */
  createdAt: string;
}

type Row = Record<string, any> & { _id: string };

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
export const isId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);

// ---------------------------------------------------------------------------------------------
// Who's who

function toClient(member: any): Client | null {
  if (!member?._id || member.status !== 'APPROVED') return null;
  const contact = member.contact ?? {};
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || member.profile?.nickname || '';
  return {
    id: member._id,
    contactId: member.contactId ?? '',
    name,
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    company: contact.company ?? '',
    phone: contact.phones?.[0] ?? '',
    email: member.loginEmail ?? '',
    isAdmin: ADMIN_MEMBER_IDS.has(member._id),
  };
}

/** The signed-in, approved member, or null for anyone else (including anonymous visitors). */
export async function currentClient(): Promise<Client | null> {
  try {
    const { member } = await members.getCurrentMember({ fieldsets: ['FULL'] });
    return toClient(member);
  } catch {
    return null;
  }
}

/** One client by member ID (admin pages only). */
export async function clientById(memberId: string): Promise<Client | null> {
  if (!isId(memberId)) return null;
  try {
    const member = await auth.elevate(members.getMember)(memberId, { fieldsets: ['FULL'] });
    return toClient(member);
  } catch {
    return null;
  }
}

/** Every approved member except admins, by name (admin pages only). */
export async function listClients(): Promise<Client[]> {
  const res = await auth.elevate(members.listMembers)({ paging: { limit: 100 }, fieldsets: ['FULL'] });
  return (res.members ?? [])
    .map(toClient)
    .filter((c): c is Client => !!c && !c.isAdmin)
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
}

/**
 * Whose space a request acts on. A client only ever gets their own; an admin gets the client they
 * chose (checked to be a real member), and nothing if they didn't choose one.
 */
export async function spaceFor(viewer: Client, requested: unknown): Promise<Client | null> {
  if (!viewer.isAdmin) return viewer;
  return isId(requested) ? clientById(requested) : null;
}

/** The page that shows a space (and optionally one folder in it). */
export function spaceUrl(viewer: Client, space: Client, folderId?: string): string {
  const base = viewer.isAdmin ? `/clients/admin/?client=${encodeURIComponent(space.id)}` : '/clients/files/';
  if (!folderId) return base;
  return `${base}${base.includes('?') ? '&' : '?'}folder=${encodeURIComponent(folderId)}`;
}

// ---------------------------------------------------------------------------------------------
// Reading

const q = () => auth.elevate(items.query);

async function rowsFor(collection: string, memberId: string, extra: Record<string, unknown> = {}): Promise<Row[]> {
  const out: Row[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res: any = await q()(collection, {
      filter: { memberId: { $eq: memberId }, ...extra },
      ...(cursor ? { cursorPaging: { limit: 100, cursor } } : { cursorPaging: { limit: 100 } }),
    });
    out.push(...(res.items as Row[]));
    cursor = res.pagingMetadata?.cursors?.next;
    if (!cursor) break;
  }
  // Belt and braces: never return a row for anyone else, whatever the query did.
  return out.filter((r) => r.memberId === memberId);
}

function dateOnly(v: unknown): string {
  if (!v) return '';
  const raw = typeof v === 'object' && v !== null && '$date' in v ? (v as any).$date : v;
  const d = raw instanceof Date ? raw : new Date(raw as string);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function isoOf(v: unknown): string {
  if (!v) return '';
  const raw = typeof v === 'object' && v !== null && '$date' in v ? (v as any).$date : v;
  const d = raw instanceof Date ? raw : new Date(raw as string);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function toFile(r: Row): ClientFile {
  return {
    id: r._id,
    title: r.title ?? r.fileName ?? 'Untitled',
    fileName: r.fileName ?? '',
    folderId: r.folderId ?? '',
    uploadedBy: r.uploadedBy === 'client' ? 'client' : 'ey-aye',
    sizeInBytes: Number(r.sizeInBytes) || 0,
    note: r.note ?? '',
    date: dateOnly(r.documentDate) || dateOnly(r._createdDate),
    createdAt: isoOf(r._createdDate),
  };
}

export async function foldersFor(space: Client): Promise<Folder[]> {
  const rows = await rowsFor(FOLDERS, space.id);
  return rows.map((r) => ({ id: r._id, name: String(r.name ?? 'Folder') })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function filesFor(space: Client): Promise<ClientFile[]> {
  const rows = await rowsFor(DOCS, space.id);
  return rows.map(toFile).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

async function folderRow(space: Client, folderId: string): Promise<Row | null> {
  if (!isId(folderId)) return null;
  try {
    const row = (await auth.elevate(items.get)(FOLDERS, folderId)) as Row | null;
    return row && row.memberId === space.id ? row : null;
  } catch {
    return null;
  }
}

async function fileRow(memberId: string | null, fileRowId: string): Promise<Row | null> {
  if (!isId(fileRowId)) return null;
  try {
    const row = (await auth.elevate(items.get)(DOCS, fileRowId)) as Row | null;
    if (!row) return null;
    return memberId === null || row.memberId === memberId ? row : null;
  } catch {
    return null;
  }
}

/**
 * A 15-minute download link for one file, or null if it doesn't exist or this viewer can't have it.
 * (Both look the same from outside, so a guessed ID tells nobody anything.)
 */
export async function downloadLink(viewer: Client, fileRowId: string): Promise<string | null> {
  const row = await fileRow(viewer.isAdmin ? null : viewer.id, fileRowId);
  if (!row?.fileId) return null;
  const { downloadUrls } = await auth.elevate(files.generateFileDownloadUrl)(row.fileId, {
    downloadFileName: row.fileName || undefined,
    expirationInMinutes: 15,
  });
  return downloadUrls?.[0]?.url ?? null;
}

// ---------------------------------------------------------------------------------------------
// Folders

export function cleanFolderName(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export async function createFolder(viewer: Client, space: Client, name: string): Promise<string | null> {
  if (!name) return 'Give the folder a name.';
  const existing = await foldersFor(space);
  if (existing.some((f) => f.name.toLowerCase() === name.toLowerCase())) return 'There’s already a folder with that name.';
  if (existing.length >= 100) return 'That’s the most folders a space can have.';
  await auth.elevate(items.insert)(FOLDERS, {
    name,
    memberId: space.id,
    clientEmail: space.email,
    createdBy: viewer.isAdmin ? 'ey-aye' : 'client',
  });
  return null;
}

export async function renameFolder(space: Client, folderId: string, name: string): Promise<string | null> {
  if (!name) return 'Give the folder a name.';
  const row = await folderRow(space, folderId);
  if (!row) return 'That folder doesn’t exist.';
  const existing = await foldersFor(space);
  if (existing.some((f) => f.id !== folderId && f.name.toLowerCase() === name.toLowerCase())) return 'There’s already a folder with that name.';
  await auth.elevate(items.update)(FOLDERS, { ...row, name });
  return null;
}

/** Admin only: deletes the folder and every file in it (files go to the Media Manager's trash). */
export async function deleteFolder(viewer: Client, space: Client, folderId: string): Promise<string | null> {
  if (!viewer.isAdmin) return 'Only Ey-aye can delete folders.';
  const row = await folderRow(space, folderId);
  if (!row) return 'That folder doesn’t exist.';
  const inside = (await rowsFor(DOCS, space.id)).filter((r) => r.folderId === folderId);
  await removeFiles(inside);
  await auth.elevate(items.remove)(FOLDERS, folderId);
  return null;
}

// ---------------------------------------------------------------------------------------------
// Files

async function removeFiles(rows: Row[]) {
  const fileIds = rows.map((r) => r.fileId).filter(Boolean);
  if (fileIds.length) await auth.elevate(files.bulkDeleteFiles)(fileIds, { permanent: false });
  for (const r of rows) await auth.elevate(items.remove)(DOCS, r._id);
}

/** Moves a file into one of the space's folders, or to the top level (folderId ''). Clients and admins. */
export async function moveFile(space: Client, fileRowId: string, folderId: string): Promise<string | null> {
  const row = await fileRow(space.id, fileRowId);
  if (!row) return 'That file doesn’t exist.';
  if (folderId && !(await folderRow(space, folderId))) return 'That folder doesn’t exist any more.';
  const { folderId: _old, ...rest } = row;
  await auth.elevate(items.update)(DOCS, folderId ? { ...rest, folderId } : rest);
  return null;
}

/** Admin only: deletes one file (to the Media Manager's trash, so it can be restored). */
export async function deleteFile(viewer: Client, space: Client, fileRowId: string): Promise<string | null> {
  if (!viewer.isAdmin) return 'Only Ey-aye can delete files.';
  const row = await fileRow(space.id, fileRowId);
  if (!row) return 'That file doesn’t exist.';
  await removeFiles([row]);
  return null;
}

const mediaFolderCache = new Map<string, string>();

async function childFolder(parentFolderId: string, name: string): Promise<string> {
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res: any = await auth.elevate(folders.listFolders)({ parentFolderId, paging: { limit: 100, ...(cursor ? { cursor } : {}) } });
    const hit = (res.folders ?? []).find((f: any) => f.displayName === name && f.state !== 'DELETED');
    if (hit) return hit._id;
    cursor = res.nextCursor?.cursors?.next ?? res.pagingMetadata?.cursors?.next;
    if (!cursor) break;
  }
  const created = await auth.elevate(folders.createFolder)(name, { parentFolderId });
  const id = created.folder?._id;
  if (!id) throw new Error(`Couldn't create media folder ${name}`);
  return id;
}

/** The client's own folder in the Media Manager: client-documents/<memberId>. */
async function mediaFolderFor(space: Client): Promise<string> {
  const cached = mediaFolderCache.get(space.id);
  if (cached) return cached;
  const root = await childFolder('media-root', MEDIA_ROOT_NAME);
  const id = await childFolder(root, space.id);
  mediaFolderCache.set(space.id, id);
  return id;
}

export const extensionOf = (name: string) => (name.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? '').toLowerCase();

export function cleanFileName(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150);
}

/** Step 1 of an upload: a one-off URL the browser sends the file straight to. */
export async function startUpload(
  space: Client,
  input: { fileName: unknown; size: unknown; folderId: unknown },
): Promise<{ uploadUrl: string; mimeType: string; fileName: string } | { error: string }> {
  const fileName = cleanFileName(input.fileName);
  const mimeType = ALLOWED_TYPES[extensionOf(fileName)];
  const size = Number(input.size);
  if (!fileName || !mimeType) return { error: 'That type of file can’t be uploaded here. PDFs, Office files, text and images are fine.' };
  if (!Number.isFinite(size) || size <= 0) return { error: 'That file looks empty.' };
  if (size > MAX_UPLOAD_BYTES) return { error: 'That file is over 50 MB. Email it instead, or ask us for another way.' };
  if (input.folderId && !(await folderRow(space, String(input.folderId)))) return { error: 'That folder doesn’t exist any more.' };

  const parentFolderId = await mediaFolderFor(space);
  const { uploadUrl } = await auth.elevate(files.generateFileUploadUrl)(mimeType, {
    fileName,
    parentFolderId,
    private: true,
    sizeInBytes: String(size),
  });
  if (!uploadUrl) throw new Error('No upload URL');
  return { uploadUrl, mimeType, fileName };
}

/**
 * Step 2: record the uploaded file in the client's space. The file must be private and sitting in
 * THIS client's Media folder, which only an upload URL made for this space can put it in, so nobody
 * can claim someone else's file by sending its ID.
 */
export async function finishUpload(
  viewer: Client,
  space: Client,
  input: { fileId: unknown; folderId: unknown },
): Promise<string | null> {
  const fileId = typeof input.fileId === 'string' ? input.fileId : '';
  if (!/^[A-Za-z0-9_~.-]{1,200}$/.test(fileId)) return 'That upload didn’t work.';
  const folderId = input.folderId ? String(input.folderId) : '';
  if (folderId && !(await folderRow(space, folderId))) return 'That folder doesn’t exist any more.';

  let d: any;
  try {
    d = await auth.elevate(files.getFileDescriptor)(fileId);
  } catch {
    return 'That upload didn’t work.';
  }
  if (!d?.private || d.parentFolderId !== (await mediaFolderFor(space))) return 'That upload didn’t work.';
  if (Number(d.sizeInBytes) > MAX_UPLOAD_BYTES) return 'That file is over 50 MB.';

  const already: any = await q()(DOCS, { filter: { fileId: { $eq: fileId } }, cursorPaging: { limit: 1 } });
  if (already.items?.length) return null;

  const fileName = cleanFileName(d.displayName) || 'file';
  await auth.elevate(items.insert)(DOCS, {
    title: fileName.replace(/\.[A-Za-z0-9]{1,8}$/, '') || fileName,
    memberId: space.id,
    clientEmail: space.email,
    fileId,
    fileName,
    folderId: folderId || undefined,
    uploadedBy: viewer.isAdmin ? 'ey-aye' : 'client',
    sizeInBytes: Number(d.sizeInBytes) || 0,
    mimeType: ALLOWED_TYPES[extensionOf(fileName)] ?? '',
    documentDate: new Date().toISOString().slice(0, 10),
  });
  const where = folderId ? (await folderRow(space, folderId))?.name : '';
  await notify(
    space,
    viewer.isAdmin ? 'ey-aye' : 'client',
    viewer.isAdmin
      ? `We've shared “${fileName}” with you${where ? ` in ${where}` : ''}. It's in your files: ${SITE_URL}/clients/files/`
      : `Uploaded “${fileName}”${where ? ` to ${where}` : ''}.`,
  );
  return null;
}

// ---------------------------------------------------------------------------------------------
// Request helpers for the /api/clients/* routes

const ALLOWED_HOSTS = /^(www\.)?ey-aye\.co\.uk$|\.wix-site-host\.com$|^localhost$|^127\.0\.0\.1$/;

/** POSTs must come from our own pages (the session cookie alone isn't proof). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return ALLOWED_HOSTS.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export const noStore = { 'Cache-Control': 'private, no-store' };

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...noStore, 'Content-Type': 'application/json' } });

export const longDate = (iso: string) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export function fileSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
