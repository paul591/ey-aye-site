# Ey-aye — ey-aye.co.uk

An [Astro](https://astro.build) site served by a Cloudflare Worker. Every push to `main` builds and deploys it through Workers Builds (`npx wrangler deploy`, which runs `npm run build` first). If the build fails, nothing deploys and the live site stays as it was.

```sh
npm install
npm run dev       # http://localhost:4321, updates as you type; shows drafts and future-dated posts
npm run build     # builds dist/, exactly what goes live
npm run preview   # builds, then runs the Worker locally (form, tracking, /stats) at http://localhost:8787
```

## Writing a post

1. Create `src/content/blog/<slug>.md`. The file name is the address: `customer-data.md` becomes `/blog/customer-data/`. Keep it short, lower case, hyphens.
2. Add two images to `public/assets/blog/`:
   - `<slug>.jpg`, 1600×900, the photo at the top of the post
   - `<slug>-hero.jpg`, 1200×630, the branded card used on the blog page, home page and in social previews
3. Fill in the details at the top, then write the post underneath in Markdown:

```markdown
---
title: "Will it leak my customers' data? The honest version."
description: "What shows in Google: one or two sentences, under about 160 characters."
socialDescription: "Optional. What shows on Facebook and LinkedIn, if different from description."
summary: "The line under the title on the blog page."
lead: "The intro paragraph under the headline."
date: 2026-11-13
readTime: 5
heroAlt: "Describe the top photo for someone who can't see it."
cta: "The line in the box at the end of the post."
ctaButton: "Optional. Defaults to Book a look-round."
draft: true
---

## A heading

A paragraph. **Bold**, *italic*, [a link](/half-day/).

- A list item
- Another

<div class="verdict-box"><b class="aye">aye</b><span>to the thing worth doing.</span></div>
```

4. `npm run dev` to read it as it will look. Remove `draft: true` (or set it to `false`) when it's ready, commit and push.

The build checks every post: a missing field, a date that isn't a date, or a missing image stops it with a message saying which post and what's wrong.

- A title ending in a full stop gets the Rapeseed stop automatically.
- Plain HTML works anywhere in a post: verdict boxes (`aye` or `nay`), figures with captions (see `built-our-own.md`).
- **Drafts** (`draft: true`) and **posts dated in the future** only show in `npm run dev`. A future-dated post goes live with the first build on or after its date, so push something that day (or rebuild from the Cloudflare dashboard).
- **Changing a post later:** add `updated: 2026-12-01` so Google and the sitemap see the change.
- Never rename a post's file once it's live: the address changes, and Relay would treat it as a new post.

Everything else updates itself: the blog page, the newest three on the home page, the sitemap (with dates), the RSS feed at `/rss.xml`, and each post's title, description, social tags and structured data.

## Layout

```text
src/
  content/blog/      One Markdown file per post
  content.config.ts  The fields a post must have
  layouts/Base.astro Head, header, nav and footer for every page
  components/        PostCard (the blog cards)
  lib/posts.ts       Which posts are published, dates, image paths
  pages/             One file per page; folder/index.astro → /folder/
  styles/style.css   The brand stylesheet (all colours and type live here)
public/              Copied as-is: assets/, favicon.svg, robots.txt, _headers, site.js
worker/index.js      The Worker (below)
```

## Adding or editing a page

Pages are in `src/pages/`, one folder per page with an `index.astro`. Each starts with a `page` block (title, description, social tags, which nav item is highlighted); the rest is the page's HTML. To add one, copy `src/pages/build/index.astro` to `src/pages/newpage/index.astro` and change both parts. It appears in the sitemap automatically. Header, nav and footer are in `src/layouts/Base.astro`, once.

## The Worker (`worker/index.js`)

- **Tagged landings.** A visit that arrives from another site with `utm_*` tags, `fbclid` or `gclid` is counted in the D1 database `ey-aye-site` (page, tags, referring site, country). No cookies, no IP address, nothing in the browser.
- **Contact form.** The form on the home page posts to `/api/enquiry`. The Worker saves it to D1 and emails it to the `ENQUIRY_TO` secret (a verified Email Routing destination) with Reply-To set to the sender, then redirects to `/thanks.html`.
- **Report.** `https://ey-aye.co.uk/stats?key=<STATS_KEY>` shows tagged visits and enquiries by channel for the last 7, 30 or 90 days.
- `public/site.js` (on every page) keeps a visit's tags on internal links and copies them into the form, so an enquiry can be tied to the link that brought someone in.

Secrets: `wrangler secret put STATS_KEY`, `wrangler secret put ENQUIRY_TO`. Tables: `schema.sql`. For `npm run preview`, put both in `.dev.vars` and run `npx wrangler d1 execute ey-aye-site --local --file schema.sql` once.

Tag every link you share: `?utm_source=facebook&utm_medium=social&utm_campaign=blog-wk2` (use `utm_medium=paid` for ads). Relay does this automatically for the posts it publishes.

## Still to do

- [ ] Booking: set up a free Cal.com account, create a 60-minute "Look-round" event type, then in `src/pages/index.astro` uncomment the iframe and replace `YOUR-HANDLE`.
- [ ] Photos: replace the `[Photo …]` placeholders on the home and work pages. Put files in `public/assets/` and swap the placeholder for an `<img>` as shown in the comment.
- [ ] Phone number in the footer (`src/layouts/Base.astro`), if you want it public.
- [ ] Prices: £350 / from £2,500 / from £150 are set in `src/pages/index.astro`.
- [ ] Automotive card: name the company on the work page only if you're clear to.
- [ ] OG image: make a 1200×630 `public/assets/og.png` (wordmark on stone); the home page already points to it.
- [ ] ICO registration number in the footer (`src/layouts/Base.astro`), which currently says `[REFERENCE]`.
- [ ] If Loftsoft becomes a Ltd: company number and registered office in the footer, privacy and terms pages.
