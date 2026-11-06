// Ey-aye site Worker. Static files are served from the repo root; this script only adds:
//
//   Tagged landings  A visit that arrives from another site with utm_* tags, fbclid or gclid
//                    is counted in D1 (page, tags, referring site, country). No cookies,
//                    no IP address, nothing stored in the visitor's browser.
//   POST /api/enquiry  The contact form. Saves the enquiry to D1, emails it to ENQUIRY_TO
//                    with Reply-To set to the sender, then redirects to /thanks.html.
//   GET /stats?key=  Last 30 days of tagged landings and enquiries by channel. STATS_KEY secret.
//
// Secrets (wrangler secret put NAME): STATS_KEY, ENQUIRY_TO (must be a verified
// Email Routing destination address).
import { EmailMessage } from 'cloudflare:email';

const TAGS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const CLICK_IDS = ['fbclid', 'gclid', 'msclkid'];
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|meta-externalagent|linkedinbot|preview|headless|lighthouse/i;
const FROM = 'website@ey-aye.co.uk';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/enquiry') {
      return request.method === 'POST' ? enquiry(request, env, url) : new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    }
    if (url.pathname === '/stats' || url.pathname === '/stats/') return stats(env, url);

    if (request.method === 'GET' && isTaggedLanding(request, url)) {
      ctx.waitUntil(logLanding(env, request, url).catch(err => console.error('landing log failed', err)));
    }
    return env.ASSETS.fetch(request);
  },
};

function tagsFrom(params) {
  const t = {};
  for (const k of TAGS) t[k.slice(4)] = clean(params.get(k), 100);
  t.click_id = CLICK_IDS.find(k => params.has(k)) || null; // which ad platform, not the ID itself
  return t;
}

function isTaggedLanding(request, url) {
  if (!TAGS.some(k => url.searchParams.has(k)) && !CLICK_IDS.some(k => url.searchParams.has(k))) return false;
  if (!(request.headers.get('Accept') || '').includes('text/html')) return false;
  if (BOT.test(request.headers.get('User-Agent') || '')) return false;
  // site.js carries the tags onto internal links; only count the first page of a visit.
  const ref = refHost(request);
  return !ref || !ref.endsWith('ey-aye.co.uk');
}

function refHost(request) {
  try { return new URL(request.headers.get('Referer')).hostname; } catch { return null; }
}

async function logLanding(env, request, url) {
  const t = tagsFrom(url.searchParams);
  await env.DB.prepare(
    'INSERT INTO landings (ts, path, source, medium, campaign, content, term, click_id, referrer, country) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).bind(new Date().toISOString(), url.pathname, t.source, t.medium, t.campaign, t.content, t.term, t.click_id,
         refHost(request), request.cf?.country || null).run();
}

// ---------- Contact form ----------

async function enquiry(request, env, url) {
  let form;
  try { form = await request.formData(); } catch { return page('That didn’t send', 'Something went wrong reading the form. Please try again.', 400); }
  if (form.get('botcheck')) return Response.redirect(`${url.origin}/thanks.html`, 303);

  const e = {
    name: clean(form.get('name'), 120),
    business: clean(form.get('business'), 160),
    email: clean(form.get('email'), 200),
    message: clean(form.get('message'), 5000, true),
    heard_about: clean(form.get('heard_about'), 60),
    landing: clean(form.get('landing'), 200),
  };
  if (!e.name || !e.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) {
    return page('Nearly', 'We need your name and a working email address to reply. Go back and check those two.', 400);
  }
  const t = tagsFrom(new URLSearchParams(TAGS.concat(CLICK_IDS).map(k => [k, form.get(k) || '']).filter(([, v]) => v)));
  const ts = new Date().toISOString();

  let id = null;
  try {
    const r = await env.DB.prepare(
      'INSERT INTO enquiries (ts, name, business, email, message, heard_about, source, medium, campaign, content, click_id, landing) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id'
    ).bind(ts, e.name, e.business, e.email, e.message, e.heard_about, t.source, t.medium, t.campaign, t.content, t.click_id, e.landing).first();
    id = r?.id ?? null;
  } catch (err) { console.error('enquiry save failed', err); }

  let emailed = false;
  try {
    await env.MAILER.send(new EmailMessage(FROM, env.ENQUIRY_TO, mime(env.ENQUIRY_TO, e, t, ts)));
    emailed = true;
  } catch (err) { console.error('enquiry email failed', err); }

  if (id !== null && emailed) await env.DB.prepare('UPDATE enquiries SET emailed = 1 WHERE id = ?').bind(id).run().catch(() => {});
  if (id === null && !emailed) {
    return page('That didn’t send', 'Sorry, the form isn’t working right now. Please email <a href="mailto:paul@ey-aye.co.uk">paul@ey-aye.co.uk</a> and we’ll pick it up from there.', 500);
  }
  return Response.redirect(`${url.origin}/thanks.html`, 303);
}

function clean(v, max, multiline = false) {
  if (typeof v !== 'string') return null;
  v = multiline ? v.replace(/\r\n?/g, '\n') : v.replace(/[\r\n\t]+/g, ' ');
  v = v.trim().slice(0, max);
  return v || null;
}

function mime(to, e, t, ts) {
  const enc = s => `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`;
  const channel = [t.source, t.medium, t.campaign].filter(Boolean).join(' / ');
  const body = [
    `Name: ${e.name}`,
    `Business: ${e.business || '-'}`,
    `Email: ${e.email}`,
    `Heard about us: ${e.heard_about || '-'}`,
    `Tracked link: ${channel || '-'}${t.click_id ? ` (${t.click_id})` : ''}`,
    `Sent from: ${e.landing || '-'}`,
    '',
    e.message || '(no message)',
  ].join('\n');
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(body))).replace(/.{76}/g, '$&\r\n');
  return [
    `From: ${enc('Ey-aye website')} <${FROM}>`,
    `To: <${to}>`,
    `Reply-To: ${enc(e.name)} <${e.email}>`,
    `Subject: ${enc(`Ey-aye enquiry from ${e.name}${e.business ? `, ${e.business}` : ''}`)}`,
    `Date: ${new Date(ts).toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@ey-aye.co.uk>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64,
  ].join('\r\n');
}

// ---------- Report ----------

async function stats(env, url) {
  const key = url.searchParams.get('key') || '';
  if (!env.STATS_KEY || key.length !== env.STATS_KEY.length || !timingSafeEqual(key, env.STATS_KEY)) {
    return new Response('Not found', { status: 404 });
  }
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days'), 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const q = sql => env.DB.prepare(sql).bind(since).all().then(r => r.results);

  const [byChannel, byCampaign, byPage, enqByHeard, enqByChannel, totals] = await Promise.all([
    q(`SELECT COALESCE(source, click_id, '(no source)') AS source, COALESCE(medium, '') AS medium, COUNT(*) AS n FROM landings WHERE ts >= ? GROUP BY 1, 2 ORDER BY n DESC`),
    q(`SELECT campaign, COALESCE(content, '') AS content, COUNT(*) AS n FROM landings WHERE ts >= ? AND campaign IS NOT NULL GROUP BY 1, 2 ORDER BY n DESC LIMIT 30`),
    q(`SELECT path, COUNT(*) AS n FROM landings WHERE ts >= ? GROUP BY 1 ORDER BY n DESC LIMIT 20`),
    q(`SELECT COALESCE(heard_about, '(not said)') AS heard, COUNT(*) AS n FROM enquiries WHERE ts >= ? GROUP BY 1 ORDER BY n DESC`),
    q(`SELECT COALESCE(source, '(untagged)') AS source, COALESCE(campaign, '') AS campaign, COUNT(*) AS n FROM enquiries WHERE ts >= ? GROUP BY 1, 2 ORDER BY n DESC`),
    q(`SELECT (SELECT COUNT(*) FROM landings WHERE ts >= ?1) AS landings, (SELECT COUNT(*) FROM enquiries WHERE ts >= ?1) AS enquiries, (SELECT COUNT(*) FROM enquiries WHERE ts >= ?1 AND emailed = 0) AS unsent`),
  ]);
  const t = totals[0] || {};
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const table = (head, rows, cols) => rows.length
    ? `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<p class="small">Nothing yet.</p>';
  const ranges = [7, 30, 90].map(d => d === days ? `<strong>${d} days</strong>` : `<a href="?key=${encodeURIComponent(key)}&days=${d}">${d} days</a>`).join(' · ');

  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Stats — Ey-aye</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Archivo+Black&display=swap"><link rel="stylesheet" href="/style.css?v=22">
<style>.stats{padding-top:40px;padding-bottom:64px;display:flex;flex-direction:column;gap:28px}.stats h1{font-size:clamp(32px,5vw,48px)}.tiles{display:flex;flex-wrap:wrap;gap:16px}.tile{flex:1 1 160px;background:var(--white);border:1px solid var(--rule);border-radius:12px;padding:16px 20px}.tile b{display:block;font-family:var(--font-display);font-size:36px}.stats table{width:100%;border-collapse:collapse;font-size:16px;background:var(--white);border:1px solid var(--rule);border-radius:12px;overflow:hidden}.stats th,.stats td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--rule)}.stats th{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--flag)}.stats td:last-child,.stats th:last-child{text-align:right}.scroll{overflow-x:auto}</style>
</head><body><main><section class="wrap stats">
<h1>Where people came from<span class="stop">.</span></h1>
<p class="small">${ranges}. Counts visits that arrived on a tagged link (utm tags or an ad click ID). Untagged traffic is in Cloudflare Web Analytics.</p>
<div class="tiles"><div class="tile"><b>${t.landings ?? 0}</b>tagged visits</div><div class="tile"><b>${t.enquiries ?? 0}</b>enquiries</div>${t.unsent ? `<div class="tile"><b>${t.unsent}</b>enquiries not emailed</div>` : ''}</div>
<h2>Visits by source</h2><div class="scroll">${table(['Source', 'Medium', 'Visits'], byChannel, ['source', 'medium', 'n'])}</div>
<h2>Visits by campaign</h2><div class="scroll">${table(['Campaign', 'Content', 'Visits'], byCampaign, ['campaign', 'content', 'n'])}</div>
<h2>Landing pages</h2><div class="scroll">${table(['Page', 'Visits'], byPage, ['path', 'n'])}</div>
<h2>Enquiries: how they heard about us</h2><div class="scroll">${table(['Answer', 'Enquiries'], enqByHeard, ['heard', 'n'])}</div>
<h2>Enquiries: tracked link</h2><div class="scroll">${table(['Source', 'Campaign', 'Enquiries'], enqByChannel, ['source', 'campaign', 'n'])}</div>
</section></main></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' } });
}

function timingSafeEqual(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function page(title, text, status) {
  return new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} — Ey-aye</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Archivo+Black&display=swap"><link rel="stylesheet" href="/style.css?v=22"></head><body><main><section class="wrap hero"><div class="hero-copy"><h1>${title}.</h1><p class="lead">${text}</p><div class="hero-actions"><a href="javascript:history.back()" class="btn btn-outline">Go back</a></div></div></section></main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
