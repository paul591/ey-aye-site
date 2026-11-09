// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';

export default defineConfig({
  site: 'https://ey-aye.co.uk',
  // `about/index.astro` → /about/index.html and `thanks.astro` → /thanks.html: the same URLs as before.
  build: { format: 'preserve' },
  trailingSlash: 'ignore',
  // Keep quotes and dashes exactly as typed.
  markdown: { processor: satteri({ features: { smartPunctuation: false } }) },
});
