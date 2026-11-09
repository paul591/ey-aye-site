// POST /api/clients/folders: add, rename or delete a folder (a plain form post from the client area).
//   action=create  name=…
//   action=rename  folderId=…  name=…
//   action=delete  folderId=…            (admin only)
// Admins also send client=<memberId> to say whose space. Always answers with a redirect back to the
// space, carrying any problem as ?msg= so the page can show it.
import type { APIRoute } from 'astro';
import { cleanFolderName, createFolder, currentClient, deleteFolder, LOGIN_URL, noStore, renameFolder, sameOrigin, spaceFor, spaceUrl } from '../../../lib/clients';

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
  if (!form) return back('/clients/', 'Something went wrong. Please try again.');
  const space = await spaceFor(viewer, form.get('client'));
  if (!space) return back(viewer.isAdmin ? '/clients/admin/' : '/clients/');

  const action = form.get('action');
  const folderId = String(form.get('folderId') ?? '');
  const name = cleanFolderName(form.get('name'));
  try {
    if (action === 'create') return back(spaceUrl(viewer, space), await createFolder(viewer, space, name));
    if (action === 'rename') return back(spaceUrl(viewer, space, folderId), await renameFolder(space, folderId, name));
    if (action === 'delete') return back(spaceUrl(viewer, space), await deleteFolder(viewer, space, folderId));
  } catch (err) {
    console.error('client folder action failed', err);
    return back(spaceUrl(viewer, space), 'That didn’t work. Please try again.');
  }
  return back(spaceUrl(viewer, space));
};

export const GET: APIRoute = () => new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
