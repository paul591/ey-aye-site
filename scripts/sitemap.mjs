// Rebuilds sitemap.xml with a <lastmod> date for every page.
//
//   Blog posts   dateModified (if set) or datePublished, from the post's JSON-LD
//   Home, /blog/ the newer of the page's last commit and the newest post
//   Other pages  the page's last git commit (today, if it has uncommitted changes)
//
// Pages are any folder with an index.html. Pages marked noindex are left out.
// Runs automatically before every `wrangler deploy` (see wrangler.jsonc),
// or by hand: node scripts/sitemap.mjs
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://ey-aye.co.uk';
const SKIP = new Set(['assets', 'node_modules', 'scripts']);
const today = new Date().toISOString().slice(0, 10);

function findPages(dir = ROOT, rel = '') {
  const out = existsSync(join(dir, 'index.html')) ? [rel] : [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.') || SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...findPages(p, `${rel}${name}/`));
  }
  return out;
}

function git(args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
}

function lastChanged(file) {
  if (git(['status', '--porcelain', '--', file])) return today;
  return git(['log', '-1', '--format=%cs', '--', file]) || today;
}

function postDate(html) {
  const m = html.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/)
         || html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
  return m && m[1];
}

const pages = [];
for (const path of findPages()) {
  const file = `${path}index.html`;
  const html = readFileSync(join(ROOT, file), 'utf8');
  if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) continue;
  const isPost = path.startsWith('blog/') && path !== 'blog/';
  const date = isPost ? postDate(html) || lastChanged(file) : lastChanged(file);
  if (isPost && date > today) console.warn(`sitemap: ${path} is dated ${date}, which is in the future`);
  pages.push({ path, date, isPost });
}

const newestPost = pages.filter(p => p.isPost && p.date <= today).map(p => p.date).sort().pop() || '';
for (const p of pages) if ((p.path === '' || p.path === 'blog/') && newestPost > p.date) p.date = newestPost;

// Home first, then the other pages, then the blog index and its posts newest first.
const rank = p => (p.path === '' ? 0 : p.path === 'blog/' ? 2 : p.isPost ? 3 : 1);
pages.sort((a, b) => rank(a) - rank(b) || (a.isPost ? b.date.localeCompare(a.date) : a.path.localeCompare(b.path)));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url><loc>${SITE}/${p.path}</loc><lastmod>${p.date}</lastmod></url>`).join('\n')}
</urlset>
`;
writeFileSync(join(ROOT, 'sitemap.xml'), xml);
console.log(`sitemap: wrote ${pages.length} URLs`);
