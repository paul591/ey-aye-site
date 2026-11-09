import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// One Markdown file per post in src/content/blog/. The file name is the URL: `customer-data.md`
// becomes /blog/customer-data/. Images go in public/assets/blog/ as `<slug>.jpg` (1600×900,
// top of the post) and `<slug>-hero.jpg` (1200×630, blog cards and social previews).
const blog = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    /** Search results (meta description). */
    description: z.string(),
    /** Social previews; defaults to `description`. */
    socialDescription: z.string().optional(),
    /** One line under the title on the blog page. */
    summary: z.string(),
    /** The intro paragraph under the headline. */
    lead: z.string(),
    date: z.coerce.date(),
    /** Set when a post is materially changed after publishing. */
    updated: z.coerce.date().optional(),
    readTime: z.number().int().positive(),
    heroAlt: z.string(),
    /** The line in the call-to-action box at the end. */
    cta: z.string(),
    ctaButton: z.string().default('Book a look-round'),
    /** Drafts are built in `npm run dev` only. */
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
