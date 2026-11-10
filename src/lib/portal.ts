// The rest of the client area, built on Wix's own apps so Paul runs it from the Wix dashboard:
//
//   Messages  → Wix Inbox. One conversation per client. Paul replies from Inbox (dashboard, the
//               Inbox tab on the contact page, or the Wix app); the client reads and replies here.
//   Projects  → Wix CRM Pipelines. A card on any pipeline whose main (or additional) contact is the
//               client shows up on their overview: card name, stage tracker, description as
//               "what's next", due date. Paul moves the card in the Pipelines tab.
//   Invoices  → Wix Invoices. Any sent invoice for the client's contact, with Wix's own pay page.
//   Account   → the member's own Wix contact details.
//
// Notifications go through Inbox too: a client upload posts "Uploaded …" into their conversation
// (Wix notifies Paul as it does for any message), and Paul's uploads post "We've shared …" to them.
//
// Every call here is made on the server, elevated, and scoped to a client the caller has already
// resolved from the session (see spaceFor in clients.ts).
import { auth } from '@wix/essentials';
import { conversations, messages } from '@wix/inbox';
import { cards, pipelines } from '@wix/crm';
import { invoices } from '@wix/get-paid';
import { authentication, members } from '@wix/members';
import type { Client } from './clients';

export const SITE_URL = 'https://ey-aye.co.uk';

// ---------------------------------------------------------------------------------------------
// Messages (Wix Inbox)

export interface ChatMessage {
  id: string;
  from: 'client' | 'ey-aye';
  text: string;
  files: { name: string; url: string }[];
  /** ISO date-time */
  at: string;
}

async function conversationFor(space: Client): Promise<string> {
  const res = await auth.elevate(conversations.getOrCreateConversation)({ memberId: space.id });
  const id = res.conversation?._id;
  if (!id) throw new Error('No conversation');
  return id;
}

const iso = (v: unknown) => {
  const d = v instanceof Date ? v : new Date(String(v ?? ''));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};

function textOf(m: any): { text: string; files: { name: string; url: string }[] } {
  const c = m.content ?? {};
  const files: { name: string; url: string }[] = [];
  const parts: string[] = [];
  if (c.basic?.items) {
    for (const it of c.basic.items) {
      if (it.text) parts.push(it.text);
      if (it.image?.url) files.push({ name: it.image.filename || 'Image', url: it.image.url });
      if (it.file?.url) files.push({ name: it.file.filename || 'File', url: it.file.url });
    }
  } else if (c.minimal?.text) parts.push(c.minimal.text);
  else if (c.template) parts.push(...[c.template.title, ...(c.template.textLines ?? [])].filter(Boolean));
  else if (c.form) parts.push([c.form.title, ...(c.form.fields ?? []).map((f: any) => `${f.name}: ${f.value}`)].filter(Boolean).join('\n'));
  else if (c.system?.text) parts.push(c.system.text);
  if (!parts.length && c.previewText) parts.push(c.previewText);
  return { text: parts.join('\n'), files };
}

/** The conversation, oldest first (the latest `limit` messages). */
export async function chatFor(space: Client, limit = 50): Promise<ChatMessage[]> {
  const conversationId = await conversationFor(space);
  // Newest first by default; reversed below.
  const res = await auth.elevate(messages.listMessages)(conversationId, 'BUSINESS_AND_PARTICIPANT', { paging: { limit } });
  return (res.messages ?? [])
    .map((m: any) => {
      const { text, files } = textOf(m);
      return {
        id: String(m._id ?? m.sequence ?? ''),
        from: m.direction === 'PARTICIPANT_TO_BUSINESS' ? ('client' as const) : ('ey-aye' as const),
        text,
        files,
        at: iso(m._createdDate),
      };
    })
    .filter((m) => m.text || m.files.length)
    .reverse();
}

export function cleanMessage(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
}

/** Sends a message into the client's conversation, from the client or from Ey-aye. */
export async function sendChat(space: Client, from: 'client' | 'ey-aye', text: string): Promise<void> {
  const conversationId = await conversationFor(space);
  await auth.elevate(messages.sendMessage)(
    conversationId,
    {
      content: { basic: { items: [{ text }] } },
      direction: from === 'client' ? 'PARTICIPANT_TO_BUSINESS' : 'BUSINESS_TO_PARTICIPANT',
      visibility: 'BUSINESS_AND_PARTICIPANT',
    },
    { sendAs: from === 'client' ? 'PARTICIPANT' : 'CALLER', sendNotifications: true },
  );
}

/** Like sendChat, but never throws: a failed notification mustn't fail the upload that caused it. */
export async function notify(space: Client, from: 'client' | 'ey-aye', text: string): Promise<void> {
  try {
    await sendChat(space, from, text);
  } catch (err) {
    console.error('client notification failed', err);
  }
}

// ---------------------------------------------------------------------------------------------
// Projects (Wix CRM Pipelines)

export interface Project {
  id: string;
  name: string;
  /** The card's description: shown as "What's next". */
  next: string;
  due: string;
  stages: { name: string; state: 'done' | 'current' | 'todo' }[];
  finished: boolean;
}

const pipelineCache = new Map<string, any>();

async function pipelineById(id: string): Promise<any | null> {
  if (pipelineCache.has(id)) return pipelineCache.get(id);
  try {
    const p = await auth.elevate(pipelines.getPipeline)(id);
    pipelineCache.set(id, p);
    return p;
  } catch {
    return null;
  }
}

export async function projectsFor(space: Client): Promise<Project[]> {
  if (!space.contactId) return [];
  const res: any = await auth.elevate(cards.queryCards)({ cursorPaging: { limit: 100 } } as any);
  const mine = (res.items ?? res.cards ?? []).filter(
    (c: any) =>
      c.mainContact?.contactId === space.contactId || (c.additionalContacts ?? []).some((a: any) => a.contactId === space.contactId),
  );
  const out: Project[] = [];
  for (const c of mine) {
    const p = await pipelineById(c.pipelineId);
    const all = p ? [...(p.stages ?? []), ...(p.doneStage ? [p.doneStage] : [])] : [];
    const finished = !!p?.doneStage && c.stageId === p.doneStage._id;
    const at = all.findIndex((s: any) => s._id === c.stageId);
    out.push({
      id: c._id,
      name: c.name || 'Your project',
      next: c.description ?? '',
      due: c.dueDate ? iso(c.dueDate).slice(0, 10) : '',
      stages: all.map((s: any, i: number) => ({
        name: s.name ?? '',
        state: finished || i < at ? 'done' : i === at ? 'current' : 'todo',
      })),
      finished,
    });
  }
  // Live projects first, then by name.
  return out.sort((a, b) => Number(a.finished) - Number(b.finished) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------
// Invoices (Wix Invoices)

export interface Invoice {
  id: string;
  number: string;
  title: string;
  status: 'due' | 'part-paid' | 'paid';
  issued: string;
  due: string;
  total: string;
  balance: string;
  url: string;
  overdue: boolean;
}

function money(amount: string | undefined, currency: string): string {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP' }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

export async function invoicesFor(space: Client): Promise<Invoice[]> {
  if (!space.contactId) return [];
  const res: any = await auth.elevate(invoices.queryInvoices)({
    filter: { 'customerInfo.contactId': { $eq: space.contactId } },
    cursorPaging: { limit: 50 },
  } as any);
  const today = new Date().toISOString().slice(0, 10);
  return (res.items ?? res.invoices ?? [])
    .filter((i: any) => i.customerInfo?.contactId === space.contactId)
    .filter((i: any) => ['PUBLISHED', 'PARTIALLY_PAID', 'PAID'].includes(i.status))
    .map((i: any): Invoice => {
      const status = i.status === 'PAID' ? 'paid' : i.status === 'PARTIALLY_PAID' ? 'part-paid' : 'due';
      const due = i.dueDate ? iso(i.dueDate).slice(0, 10) : '';
      return {
        id: i._id,
        number: i.numbering?.displayNumber ?? '',
        title: i.title ?? '',
        status,
        issued: i.issueDate ? iso(i.issueDate).slice(0, 10) : '',
        due,
        total: money(i.totals?.total, i.currency),
        balance: money(i.totals?.balance, i.currency),
        url: i.links?.url ?? '',
        overdue: status !== 'paid' && !!due && due < today,
      };
    })
    .sort((a: Invoice, b: Invoice) => Number(a.status === 'paid') - Number(b.status === 'paid') || b.issued.localeCompare(a.issued));
}

// ---------------------------------------------------------------------------------------------
// Account

export const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';

export async function updateAccount(space: Client, input: { firstName: string; lastName: string; company: string; phone: string }) {
  await auth.elevate(members.updateMember)(space.id, {
    contact: {
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      company: input.company || null,
      phones: input.phone ? [input.phone] : [],
    },
  });
}

/** Emails the member Wix's own "set a new password" link. */
export async function sendPasswordEmail(space: Client) {
  if (!space.email) throw new Error('No login email');
  await auth.elevate(authentication.sendSetPasswordEmail)(space.email, { hideIgnoreMessage: true });
}

// ---------------------------------------------------------------------------------------------

export const shortDate = (isoDate: string) =>
  isoDate ? new Date(isoDate.length === 10 ? `${isoDate}T12:00:00Z` : isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export const timeAgo = (isoDate: string) => {
  if (!isoDate) return '';
  const mins = Math.round((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  return shortDate(isoDate);
};
