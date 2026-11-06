import { existsSync } from 'node:fs';
import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/**
 * Published posts, newest first. Drafts, and posts dated in the future, only show in
 * `npm run dev`; a future-dated post appears with the first build on or after its date.
 */
export async function getPosts(): Promise<Post[]> {
  const now = new Date();
  const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || (!data.draft && data.date <= now));
  for (const p of posts) checkImages(p);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** 5 November 2026 */
export const longDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });

/** 2026-11-05 */
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const postPath = (p: Post) => `/blog/${p.id}/`;
export const headerImage = (p: Post) => `/assets/blog/${p.id}.jpg`;
export const cardImage = (p: Post) => `/assets/blog/${p.id}-hero.jpg`;

/** Fail the build, with a plain message, if a post's images aren't where they should be. */
function checkImages(p: Post) {
  for (const img of [headerImage(p), cardImage(p)]) {
    if (!existsSync(`public${img}`)) {
      throw new Error(`Post "${p.id}" needs the image public${img}`);
    }
  }
}
