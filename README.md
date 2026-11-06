# Ey-aye — static site

Plain HTML and CSS, served by a Cloudflare Worker with static assets (`wrangler deploy`).

## The Worker (`src/worker.js`)

- **Tagged landings.** A visit that arrives from another site with `utm_*` tags, `fbclid` or `gclid` is counted in the D1 database `ey-aye-site` (page, tags, referring site, country). No cookies, no IP address, nothing in the browser.
- **Contact form.** The form on the home page posts to `/api/enquiry`. The Worker saves it to D1 and emails it to the `ENQUIRY_TO` secret (a verified Email Routing destination) with Reply-To set to the sender, then redirects to `/thanks.html`.
- **Report.** `https://ey-aye.co.uk/stats?key=<STATS_KEY>` shows tagged visits and enquiries by channel for the last 7, 30 or 90 days.
- `site.js` (on every page) keeps a visit's tags on internal links and copies them into the form, so an enquiry can be tied to the link that brought someone in.
- `scripts/sitemap.mjs` rebuilds `sitemap.xml` with lastmod dates before every deploy.

Secrets: `wrangler secret put STATS_KEY`, `wrangler secret put ENQUIRY_TO`. Tables: `schema.sql`.

Tag every link you share: `?utm_source=facebook&utm_medium=social&utm_campaign=blog-wk2` (use `utm_medium=paid` for ads).

## Files

- `index.html` — home page
- `work/index.html` — work page
- `thanks.html` — form success page
- `style.css` — the brand stylesheet (all colours and type live here)
- `favicon.svg` — the mark
- `assets/loftsoft.png` — Loftsoft endorsement logo
- `_headers` — security and caching headers for Cloudflare Pages
- `robots.txt`, `sitemap.xml`

## Original Cloudflare Pages notes (the site now deploys as a Worker)

1. Push this folder to a GitHub repo (e.g. `ey-aye-site`).
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Build settings: Framework preset **None**, build command **empty**, output directory **/** (root).
4. Deploy. You get `ey-aye-site.pages.dev` immediately.
5. Custom domains → add `ey-aye.co.uk` and `www.ey-aye.co.uk`. With DNS already on Cloudflare the records are created for you.
6. Optional: in the Cloudflare zone, add a Redirect Rule so `eyaye.co.uk`, `eyaye.uk` and `ey-aye.com` all 301 to `https://ey-aye.co.uk`.

Every push to `main` redeploys. Preview URLs are created for other branches.

## Before going live

- [ ] Booking: set up a free Cal.com account, create a 60-minute "Look-round" event type with your availability, then in `index.html` uncomment the iframe and replace `YOUR-HANDLE`.
- [ ] Photos: replace the three `[Photo …]` placeholders on the home page and the ones on the work page. Put files in `assets/` and swap the placeholder text for an `<img>` as shown in the comment.
- [ ] Phone number: add it to the footer in both pages if you want it public.
- [ ] Prices: £350 / from £2,500 / from £150 are set in `index.html`. Change if needed.
- [ ] Automotive card: name the company on `work/index.html` only if you're clear to.
- [ ] OG image: make a 1200×630 `assets/og.png` (wordmark on stone) for link previews.
- [ ] If Loftsoft becomes a Ltd: company number and registered office in the footer, privacy and terms pages.

## Adding a page

Copy `work/index.html` to `newpage/index.html`, keep the header and footer, change the `<title>`, description and canonical, add it to `sitemap.xml`.

## Blog

Start with `blog/index.html` and one HTML file per post. Past ten posts, add Astro or 11ty; the hosting doesn't change.
