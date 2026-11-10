// POST /api/clients/messages: the client sends a message to Ey-aye (into Wix Inbox).
import type { APIRoute } from 'astro';
import { currentClient, LOGIN_URL, noStore, sameOrigin } from '../../../lib/clients';
import { cleanMessage, sendChat } from '../../../lib/portal';

const go = (url: string) => new Response(null, { status: 303, headers: { ...noStore, Location: url } });

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403, headers: noStore });
  const viewer = await currentClient();
  if (!viewer) return go(LOGIN_URL);
  if (viewer.isAdmin) return go('/clients/admin/');
  const form = await request.formData().catch(() => null);
  const text = cleanMessage(form?.get('text'));
  if (!text) return go('/clients/messages/#latest');
  try {
    await sendChat(viewer, 'client', text);
  } catch (err) {
    console.error('client message failed', err);
    return go('/clients/messages/?error=1#latest');
  }
  return go('/clients/messages/?sent=1#latest');
};

export const GET: APIRoute = () => new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
