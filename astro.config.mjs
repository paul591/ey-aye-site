// @ts-check
import { defineConfig } from 'astro/config';
import wix from '@wix/astro';
import wixPages from '@wix/astro-pages';
import wixHostingAdapter from '@wix/astro-wix-hosting-adapter';

export default defineConfig({
  site: 'https://ey-aye.co.uk',
  // Pages render on Wix's servers, so blog posts published in the Wix dashboard show straight away.
  output: 'server',
  adapter: wixHostingAdapter(),
  // wix() signs every Wix API call in; wixPages() publishes the page list (/_wix/pages.json) that
  // feeds Wix's sitemap (/sitemap.xml) and the dashboard's SEO settings. (No React: the post page
  // renders Wix's SEO tags with src/components/WixSeoTags.astro instead of the React <SEO.Tags>.)
  integrations: [wix(), wixPages()],
  // Astro's same-site check misfires behind Wix's proxy; Wix's own setup turns it off.
  security: { checkOrigin: false },
  image: { domains: ['static.wixstatic.com'] },
  // Pages render on the server, so `thanks.astro` is /thanks (the static site had /thanks.html).
  build: { format: 'preserve' },
  redirects: { '/thanks.html': '/thanks' },
  trailingSlash: 'ignore',
});
