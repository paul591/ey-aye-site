// GET /clients/doc/<id>: download one file.
//
// A client can only download rows carrying THEIR member ID; an admin can download any. The answer
// is a redirect to a 15-minute link for the private file. A missing file and someone else's file
// both get the same 404, so guessing IDs reveals nothing.
import type { APIRoute } from 'astro';
import { currentClient, downloadLink, LOGIN_URL, noStore } from '../../../lib/clients';

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { ...noStore, 'Content-Type': 'text/plain; charset=utf-8' } });

export const GET: APIRoute = async ({ params }) => {
  const viewer = await currentClient();
  if (!viewer) return new Response(null, { status: 302, headers: { ...noStore, Location: LOGIN_URL } });

  let url: string | null = null;
  try {
    url = await downloadLink(viewer, params.id ?? '');
  } catch (err) {
    console.error('client download failed', err);
    return text(502, 'That download isn’t working just now. Please try again, or email paul@ey-aye.co.uk.');
  }
  if (!url) return text(404, 'Not found');
  return new Response(null, { status: 302, headers: { ...noStore, Location: url } });
};
