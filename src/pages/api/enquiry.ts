// POST /api/enquiry: the contact form on the home page.
//
// Saves the enquiry as a submission of the "Enquiry" form in Wix Forms, then sends the visitor to
// /thanks. In the Wix dashboard it appears under Forms & Submissions, creates or updates a
// contact (name, business, email), and Wix sends the notification email.
//
// The page's own form stays as it is: this route maps its field names onto the Wix form's fields.
// The Wix form's field keys (`target`s) are fixed; the labels and options can be changed in the
// dashboard without touching this file. Visitor submissions need no elevated permissions.
import type { APIRoute } from 'astro';
import { submissions } from '@wix/forms';

/** The "Enquiry" form in Wix Forms (Dashboard → Forms & Submissions). */
const FORM_ID = '90b8361e-c889-486f-b661-a4e66dc045f4';

const TAGS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const CLICK_IDS = ['fbclid', 'gclid', 'msclkid'];
const HEARD_ABOUT = ['Facebook', 'Instagram', 'LinkedIn', 'Google search', 'Our blog', 'Someone recommended you', 'Met at an event', 'Other'];

function clean(v: FormDataEntryValue | null, max: number, multiline = false): string {
  if (typeof v !== 'string') return '';
  let s = v.replace(/\r\n?/g, '\n');
  s = multiline ? s.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim().slice(0, max);
}

/** utm tags as "source=facebook · medium=social", plus which ad platform (not the click ID itself). */
function tracking(form: FormData): string {
  const parts = TAGS.map((k) => [k.slice(4), clean(form.get(k), 100)]).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`);
  const click = CLICK_IDS.find((k) => clean(form.get(k), 300));
  if (click) parts.push(`click=${click}`);
  return parts.join(' · ');
}

function page(title: string, text: string, status: number): Response {
  return new Response(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} — Ey-aye</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Archivo+Black&display=swap"><link rel="stylesheet" href="/style.css"></head><body><main><section class="wrap hero"><div class="hero-copy"><h1>${title}.</h1><p class="lead">${text}</p><div class="hero-actions"><a href="javascript:history.back()" class="btn btn-outline">Go back</a></div></div></section></main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

// Relative, because behind Wix's proxy the request URL is an internal address, not the public one.
const thanks = () => new Response(null, { status: 303, headers: { Location: '/thanks' } });

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return page('That didn’t send', 'Something went wrong reading the form. Please try again.', 400);
  }
  // The hidden "botcheck" box is only ever ticked by bots: thank them and drop it.
  if (form.get('botcheck')) return thanks();

  const name = clean(form.get('name'), 120);
  const email = clean(form.get('email'), 200);
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return page('Nearly', 'We need your name and a working email address to reply. Go back and check those two.', 400);
  }

  // Keyed by the Wix form's field targets. Empty values are left out (an optional field can be blank).
  const heard = clean(form.get('heard_about'), 60);
  const values: Record<string, string> = {
    name,
    email,
    business: clean(form.get('business'), 160),
    message: clean(form.get('message'), 5000, true),
    heard_about: HEARD_ABOUT.includes(heard) ? heard : '',
    landing_page: clean(form.get('landing'), 200),
    tracking: tracking(form),
  };
  for (const k of Object.keys(values)) if (!values[k]) delete values[k];

  try {
    // Any resolved status (CONFIRMED, PENDING) means the submission exists: thank them either way.
    await submissions.createSubmission({ formId: FORM_ID, submissions: values });
  } catch (err) {
    console.error('enquiry submission failed', err);
    return page(
      'That didn’t send',
      'Sorry, the form isn’t working right now. Please email <a href="mailto:paul@ey-aye.co.uk">paul@ey-aye.co.uk</a> and we’ll pick it up from there.',
      500,
    );
  }
  return thanks();
};

export const GET: APIRoute = () => new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
