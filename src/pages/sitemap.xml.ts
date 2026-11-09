// /sitemap.xml with a <lastmod> for every page. Relay and Search Console both read it here.
//   Posts:        the post's last update in Wix, else its publish date
//   Home, /blog/: the newer of the page's last commit and the newest post
//   Other pages:  the page source's last git commit, captured at build (astro.config.mjs)
import type { APIRoute } from 'astro';
import { getPosts, isoDate, postPath } from '../lib/posts';

const SITE = 'https://ey-aye.co.uk';
declare const __PAGE_DATES__: Record<string, string>;

export const GET: APIRoute = async () => {
  // Every page under src/pages except dynamic routes, endpoints and noindex pages.
  const pages = Object.entries(__PAGE_DATES__)
    .filter(([f]) => !f.includes('[') && f !== 'thanks.astro')
    .map(([f, date]) => ({ path: '/' + f.replace(/index\.astro$/, '').replace(/\.astro$/, '.html'), date }));

  let posts: { path: string; date: string }[] = [];
  try {
    posts = (await getPosts()).map((p) => ({ path: postPath(p.slug), date: isoDate(p.updatedISO || p.dateISO) }));
  } catch {
    // The pages still list if Wix Blog can't be read.
  }
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
