// POST /api/clients/files: delete a file (admin only; a plain form post).
//   action=delete  id=<file row id>  client=<memberId>
import type { APIRoute } from 'astro';
import { currentClient, deleteFile, LOGIN_URL, noStore, sameOrigin, spaceFor, spaceUrl } from '../../../lib/clients';

const back = (url: string, msg?: string | null) =>
  new Response(null, {
    status: 303,
    headers: { ...noStore, Location: msg ? `${url}${url.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` : url },
  });

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403, headers: noStore });
  const viewer = await currentClient();
  if (!viewer) return back(LOGIN_URL);
  const form = await request.formData().catch(() => null);
  if (!form) return back('/clients/');
  const space = await spaceFor(viewer, form.get('client'));
  if (!space) return back(viewer.isAdmin ? '/clients/admin/' : '/clients/');
  const folderId = String(form.get('folderId') ?? '') || undefined;

  if (form.get('action') !== 'delete') return back(spaceUrl(viewer, space, folderId));
  try {
    return back(spaceUrl(viewer, space, folderId), await deleteFile(viewer, space, String(form.get('id') ?? '')));
  } catch (err) {
    console.error('client file delete failed', err);
    return back(spaceUrl(viewer, space, folderId), 'That didn’t work. Please try again.');
  }
};

export const GET: APIRoute = () => new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
