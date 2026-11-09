// @ts-check
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig } from 'astro/config';
import wix from '@wix/astro';
import wixPages from '@wix/astro-pages';
import wixHostingAdapter from '@wix/astro-wix-hosting-adapter';

// Each page's last git commit date, captured at build for /sitemap.xml (the server has no git).
function pageDates() {
  const today = new Date().toISOString().slice(0, 10);
  const root = 'src/pages';
  /** @type {Record<string, string>} */
  const dates = {};
  const walk = (/** @type {string} */ dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.astro')) {
        let date = '';
        try {
          date = execFileSync('git', ['log', '-1', '--format=%cs', '--', p], { encoding: 'utf8' }).trim();
        } catch {}
        dates[relative(root, p).split('\\').join('/')] = date || today;
      }
    }
  };
  walk(root);
  return dates;
}

export default defineConfig({
  site: 'https://ey-aye.co.uk',
  // Pages render on Wix's servers, so blog posts published in the Wix dashboard show straight away.
  output: 'server',
  adapter: wixHostingAdapter(),
  // wix() signs every Wix API call in; wixPages() publishes the page list Wix's SEO tools read.
  integrations: [wix(), wixPages()],
  // Astro's same-site check misfires behind Wix's proxy; Wix's own setup turns it off.
  security: { checkOrigin: false },
  image: { domains: ['static.wixstatic.com'] },
  // `about/index.astro` → /about/ and `thanks.astro` → /thanks.html: the same URLs as before.
  build: { format: 'preserve' },
  trailingSlash: 'ignore',
  vite: { define: { __PAGE_DATES__: JSON.stringify(pageDates()) } },
});
