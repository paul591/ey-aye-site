// POST /api/clients/account: the signed-in client updates their own details, or asks for a
// password email. Only ever acts on the session's own member.
import type { APIRoute } from 'astro';
import { currentClient, LOGIN_URL, noStore, sameOrigin } from '../../../lib/clients';
import { clean, sendPasswordEmail, updateAccount } from '../../../lib/portal';

const go = (done: string) => new Response(null, { status: 303, headers: { ...noStore, Location: `/clients/account/?done=${done}` } });

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403, headers: noStore });
  const viewer = await currentClient();
  if (!viewer) return new Response(null, { status: 303, headers: { ...noStore, Location: LOGIN_URL } });
  const form = await request.formData().catch(() => null);
  if (!form) return go('error');
  try {
    if (form.get('action') === 'password') {
      await sendPasswordEmail(viewer);
      return go('password');
    }
    const phone = clean(form.get('phone'), 30);
    await updateAccount(viewer, {
      firstName: clean(form.get('firstName'), 60),
      lastName: clean(form.get('lastName'), 60),
      company: clean(form.get('company'), 100),
      phone: /^[0-9+()\-. ]{0,30}$/.test(phone) ? phone : viewer.phone,
    });
    return go('saved');
  } catch (err) {
    console.error('client account update failed', err);
    return go('error');
  }
};

export const GET: APIRoute = () => new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
