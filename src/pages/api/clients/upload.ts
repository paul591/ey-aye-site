// POST /api/clients/upload (JSON, from the upload box in the client area).
//   { step: 'start',  fileName, size, folderId?, client? } → { uploadUrl, mimeType, fileName }
//     The browser then PUTs the file straight to uploadUrl (Wix's upload service), which answers
//     with { file: { id, … } }.
//   { step: 'finish', fileId, folderId?, client? }         → { ok: true }
// `client` is only used by admins, to say whose space.
import type { APIRoute } from 'astro';
import { currentClient, finishUpload, json, sameOrigin, spaceFor, startUpload } from '../../../lib/clients';

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return json(403, { error: 'Forbidden' });
  const viewer = await currentClient();
  if (!viewer) return json(401, { error: 'You’ve been signed out. Sign in again and retry.' });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Bad request.' });
  }
  const space = await spaceFor(viewer, body.client);
  if (!space) return json(400, { error: 'Pick a client first.' });

  try {
    if (body.step === 'start') {
      const res = await startUpload(space, { fileName: body.fileName, size: body.size, folderId: body.folderId });
      return 'error' in res ? json(400, res) : json(200, res);
    }
    if (body.step === 'finish') {
      const err = await finishUpload(viewer, space, { fileId: body.fileId, folderId: body.folderId });
      return err ? json(400, { error: err }) : json(200, { ok: true });
    }
  } catch (err) {
    console.error('client upload failed', err);
    return json(502, { error: 'The upload didn’t work just now. Please try again.' });
  }
  return json(400, { error: 'Bad request.' });
};

export const GET: APIRoute = () => new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
