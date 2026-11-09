// The client area: who's signed in, and the documents Paul has shared with them.
//
// Documents live in the `ClientDocuments` CMS collection (Dashboard → CMS), one row per file:
//   title*, memberId*, fileId*, fileName, clientEmail, note, documentDate   (* = required)
// The collection is admin-only, so nobody can read it from a browser. These helpers read it with
// elevated permissions on the server, and ALWAYS filter by the member ID from the visitor's own
// login session (never by anything in the request), so a client only ever sees their own rows.
//
// The files are uploaded to the Media Manager as private files. Their normal URLs return 403; the
// only way to fetch one is a short-lived download link made here, after the ownership check.
import { auth } from '@wix/essentials';
import { members } from '@wix/members';
import { items } from '@wix/data';
import { files } from '@wix/media';

const COLLECTION = 'ClientDocuments';

/** Where the "Client login" link goes: Wix's own sign-in page, then back to the client area. */
export const LOGIN_URL = '/api/auth/login?returnToUrl=/clients/';
export const LOGOUT_URL = '/api/auth/logout?returnToUrl=/';

export interface Client {
  id: string;
  name: string;
  email: string;
}

export interface ClientDocument {
  id: string;
  title: string;
  fileName: string;
  note: string;
  /** As YYYY-MM-DD, or '' if not set. */
  date: string;
}

interface DocumentRow {
  _id: string;
  title?: string;
  memberId?: string;
  fileId?: string;
  fileName?: string;
  note?: string;
  documentDate?: string | Date | { $date: string } | null;
  _createdDate?: string | Date | { $date: string } | null;
}

/** The signed-in, approved member, or null for anyone else (including anonymous visitors). */
export async function currentClient(): Promise<Client | null> {
  try {
    const { member } = await members.getCurrentMember({ fieldsets: ['FULL'] });
    if (!member?._id || member.status !== 'APPROVED') return null;
    const contact = member.contact ?? {};
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || member.profile?.nickname || '';
    return { id: member._id, name, email: member.loginEmail ?? '' };
  } catch {
    // An anonymous visitor makes this throw or come back empty: both mean "not signed in".
    return null;
  }
}

function dateOnly(v: DocumentRow['documentDate']): string {
  if (!v) return '';
  const raw = typeof v === 'object' && '$date' in v ? v.$date : v;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function toDocument(row: DocumentRow): ClientDocument {
  return {
    id: row._id,
    title: row.title ?? 'Untitled',
    fileName: row.fileName ?? '',
    note: row.note ?? '',
    date: dateOnly(row.documentDate) || dateOnly(row._createdDate),
  };
}

/** Every document shared with this member, newest first. */
export async function documentsFor(client: Client): Promise<ClientDocument[]> {
  const query = auth.elevate(items.query);
  const res = await query(COLLECTION, { filter: { memberId: { $eq: client.id } }, paging: { limit: 100 } });
  const rows = (res.items as unknown as DocumentRow[]).filter((r) => r.memberId === client.id);
  return rows.map(toDocument).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

/**
 * A 15-minute download link for one document, or null if it doesn't exist or isn't this member's.
 * (Both cases look the same from outside, so a guessed ID tells nobody anything.)
 */
export async function downloadLink(client: Client, documentId: string): Promise<string | null> {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(documentId)) return null;
  const get = auth.elevate(items.get);
  let row: DocumentRow | null;
  try {
    row = (await get(COLLECTION, documentId)) as unknown as DocumentRow | null;
  } catch {
    return null;
  }
  if (!row || row.memberId !== client.id || !row.fileId) return null;

  const makeLink = auth.elevate(files.generateFileDownloadUrl);
  const { downloadUrls } = await makeLink(row.fileId, {
    downloadFileName: row.fileName || undefined,
    expirationInMinutes: 15,
  });
  return downloadUrls?.[0]?.url ?? null;
}

export const longDate = (iso: string) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
