// GET /clients/doc/<id>: download one shared document.
//
// Checks the visitor is signed in and that the document's row carries THEIR member ID, then sends
// them to a 15-minute download link for the private file. A missing document and someone else's
// document both get the same 404, so guessing IDs reveals nothing.
import type { APIRoute } from 'astro';
import { currentClient, downloadLink, LOGIN_URL } from '../../../lib/clients';

const noStore = { 'Cache-Control': 'private, no-store' };

export const GET: APIRoute = async ({ params }) => {
  const client = await currentClient();
  if (!client) return new Response(null, { status: 302, headers: { ...noStore, Location: LOGIN_URL } });

  let url: string | null = null;
  try {
    url = await downloadLink(client, params.id ?? '');
  } catch (err) {
    console.error('client download failed', err);
    return new Response('That download isn’t working just now. Please try again, or email paul@ey-aye.co.uk.', {
      status: 502,
      headers: { ...noStore, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  if (!url) {
    return new Response('Not found', { status: 404, headers: { ...noStore, 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return new Response(null, { status: 302, headers: { ...noStore, Location: url } });
};
