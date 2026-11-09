// POST /api/clients/files: act on one file (a plain form post from the client area).
//   action=move    id=<file row id>  to=<folder id, or empty for the top level>   (clients and admins)
//   action=delete  id=<file row id>                                            (admin only)
// Admins also send client=<memberId> to say whose space. `folderId` is the folder the page was
// showing, so the redirect goes back there.
import type { APIRoute } from 'astro';
import { currentClient, deleteFile, isId, LOGIN_URL, moveFile, noStore, sameOrigin, spaceFor, spaceUrl } from '../../../lib/clients';

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
  const here = String(form.get('folderId') ?? '');
  const folderId = isId(here) ? here : undefined;
  const id = String(form.get('id') ?? '');

  try {
    if (form.get('action') === 'move') {
      const to = String(form.get('to') ?? '');
      return back(spaceUrl(viewer, space, folderId), await moveFile(space, id, isId(to) ? to : ''));
    }
    if (form.get('action') === 'delete') return back(spaceUrl(viewer, space, folderId), await deleteFile(viewer, space, id));
  } catch (err) {
    console.error('client file action failed', err);
    return back(spaceUrl(viewer, space, folderId), 'That didn’t work. Please try again.');
  }
  return back(spaceUrl(viewer, space, folderId));
};

export const GET: APIRoute = () => new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
