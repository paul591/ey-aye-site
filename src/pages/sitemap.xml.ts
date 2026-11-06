// /sitemap.xml with a <lastmod> for every page. Relay and Search Console both read it here.
//   Posts:        `updated` if set, else `date`
//   Home, /blog/: the newer of the page's last commit and the newest post
//   Other pages:  the page source's last git commit (the build date if git has no history)
import { execFileSync } from 'node:child_process';
import type { APIRoute } from 'astro';
import { getPosts, isoDate, postPath } from '../lib/posts';

const SITE = 'https://ey-aye.co.uk';
const today = isoDate(new Date());

function lastCommit(file: string): string {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { encoding: 'utf8' }).trim() || today;
  } catch {
    return today;
  }
}

export const GET: APIRoute = async () => {
  // Every page under src/pages except dynamic routes, endpoints and noindex pages.
  const sources = Object.keys(import.meta.glob('./**/*.astro'))
    .filter((f) => !f.includes('[') && !f.endsWith('/thanks.astro'));
  const pages = sources.map((f) => {
    const path = f.replace(/^\.\//, '/').replace(/index\.astro$/, '').replace(/\.astro$/, '.html');
    return { path, date: lastCommit(`src/pages/${f.slice(2)}`) };
  });

  const posts = (await getPosts()).map((p) => ({ path: postPath(p), date: isoDate(p.data.updated ?? p.data.date) }));
  const newest = posts.map((p) => p.date).sort().pop() ?? '';
  for (const p of pages) if ((p.path === '/' || p.path === '/blog/') && newest > p.date) p.date = newest;

  const rank = (path: string) => (path === '/' ? 0 : path === '/blog/' ? 2 : 1);
  pages.sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
  const all = [...pages, ...posts];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map((u) => `  <url><loc>${SITE}${u.path}</loc><lastmod>${u.date}</lastmod></url>`).join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
