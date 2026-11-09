// Blog posts now live in Wix Blog (write and publish them in the Wix dashboard, Blog → Posts).
// Pages read them on every request, so a post published in the dashboard is on the site straight
// away, with no rebuild. The data layer under src/wix/ is Wix's shipped code; this file adapts it
// to the site's own helpers and design.
import { fetchPostBySlug, fetchPosts } from '../wix/blog/posts';
import { imgSrc } from '../wix/media';
import { richContentToHtml } from '../wix/rich-content';
import type { PostDetail, PostSummary } from '../wix/blog/types';

export type { PostDetail, PostSummary };
export { fetchPostBySlug };

export const SITE = 'https://ey-aye.co.uk';

/** Every published post, newest first (pinned posts lead, as Wix orders them). */
export async function getPosts(): Promise<PostSummary[]> {
  const all: PostSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPosts({ limit: 50, cursor });
    all.push(...page.posts);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return all;
}

/** The newest `n` posts, for the home page. */
export async function getLatestPosts(n: number): Promise<PostSummary[]> {
  return (await fetchPosts({ limit: n })).posts;
}

/** 5 November 2026 */
export const longDate = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
    : '';

/** 2026-11-05 */
export const isoDate = (iso: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

/** The same addresses as before the move: /blog/<slug>/ */
export const postPath = (slug: string) => `/blog/${slug.split('/').map(encodeURIComponent).join('/')}/`;

/** The cover at the post page's size (1600×900) and the card/social size (1200×630). */
export const headerImage = (p: PostSummary) => imgSrc(p.coverUrl, 1600, 900);
export const cardImage = (p: PostSummary) => imgSrc(p.coverUrl, 1200, 630);

/**
 * Images inside a post keep their own shape: at most `maxWidth` wide, at the image's own
 * proportions, so nothing is cropped. Sized through imgSrc's file-id route: the SDK's scaling
 * helpers pass the original's height and width the wrong way round and shrink the image.
 */
const fitSrc = (value: unknown, maxWidth: number): string => {
  const v = typeof value === 'string' ? value : '';
  const id = v.match(/^wix:image:\/\/v1\/([^/#]+)/)?.[1];
  const ow = Number(v.match(/originWidth=(\d+)/)?.[1]);
  const oh = Number(v.match(/originHeight=(\d+)/)?.[1]);
  if (id && ow > 0 && oh > 0) {
    const w = Math.min(maxWidth, ow);
    return imgSrc(id, w, Math.round((w * oh) / ow));
  }
  return imgSrc(v, maxWidth, maxWidth);
};

export interface ArticleParts {
  /** The first paragraph, shown as the lead under the headline. */
  lead: string;
  /** The body HTML, with the site's verdict boxes and figures. */
  body: string;
  /** The closing call to action: a divider, then one paragraph of bold line + link. */
  cta: { line: string; href: string; button: string } | null;
}

/**
 * The post body as the site's article design wants it. Written in the Wix editor, a post follows
 * three conventions, and each becomes the matching piece of the design:
 *   - a quote that starts with a bold **Aye** or **Nay** → the aye/nay verdict box
 *   - an image followed by an italic line → the image with that line as its caption
 *   - a divider, then a last paragraph of bold text and a link → the teal call-to-action box
 * The first paragraph is the lead. Links to ey-aye.co.uk become site-relative.
 */
export function articleParts(post: PostDetail): ArticleParts {
  let html = richContentToHtml(post.richContent, (value, width) => fitSrc(value, width), { imageWidth: 1600 });
  if (!html && post.paragraphs.length) html = post.paragraphs.map((p) => `<p>${escape(p)}</p>`).join('');

  // Our own links stay on whichever address the site is being served from.
  html = html.replace(/href="https:\/\/(?:www\.)?ey-aye\.co\.uk\/?([^"]*)" rel="noopener noreferrer"(?: target="_blank")?/g, 'href="/$1"');

  let lead = '';
  const first = html.match(/^<p>(.*?)<\/p>/s);
  if (first) {
    lead = first[1];
    html = html.slice(first[0].length);
  }

  let cta: ArticleParts['cta'] = null;
  const last = html.match(/<hr><p><strong>(.*?)<\/strong>\s*<a href="([^"]+)"[^>]*>(.*?)<\/a><\/p>$/s);
  if (last) {
    cta = { line: last[1], href: last[2], button: last[3] };
    html = html.slice(0, last.index);
  }

  html = html.replace(
    /<blockquote><p><strong>(Aye|Nay)<\/strong>\s*(.*?)<\/p><\/blockquote>/gis,
    (_, word: string, rest: string) => {
      const w = word.toLowerCase();
      return `<div class="verdict-box"><b class="${w}">${w}</b><span>${rest}</span></div>`;
    },
  );

  html = html.replace(
    /(<img [^>]*>)<p><em>(.*?)<\/em><\/p>/gs,
    '<figure><div class="photo fig">$1</div><figcaption>$2</figcaption></figure>',
  );

  return { lead, body: html, cta };
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
