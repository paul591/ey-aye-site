import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getPosts, postPath } from '../lib/posts';

export const GET: APIRoute = async () =>
  rss({
    title: 'Straight answers — the Ey-aye blog',
    description: 'Plain-English answers on AI for small businesses in Yorkshire.',
    site: 'https://ey-aye.co.uk',
    items: (await getPosts()).map((p) => ({
      title: p.data.title,
      description: p.data.summary,
      pubDate: p.data.date,
      link: postPath(p),
    })),
    customData: '<language>en-gb</language>',
  });
