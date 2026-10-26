# Ey-aye — static site

Plain HTML and CSS. No build step. Hosted on Cloudflare Pages.

## Files

- `index.html` — home page
- `work/index.html` — work page
- `thanks.html` — form success page
- `style.css` — the brand stylesheet (all colours and type live here)
- `favicon.svg` — the mark
- `assets/loftsoft.png` — Loftsoft endorsement logo
- `_headers` — security and caching headers for Cloudflare Pages
- `robots.txt`, `sitemap.xml`

## Deploy to Cloudflare Pages

1. Push this folder to a GitHub repo (e.g. `ey-aye-site`).
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Build settings: Framework preset **None**, build command **empty**, output directory **/** (root).
4. Deploy. You get `ey-aye-site.pages.dev` immediately.
5. Custom domains → add `ey-aye.co.uk` and `www.ey-aye.co.uk`. With DNS already on Cloudflare the records are created for you.
6. Optional: in the Cloudflare zone, add a Redirect Rule so `eyaye.co.uk`, `eyaye.uk` and `ey-aye.com` all 301 to `https://ey-aye.co.uk`.

Every push to `main` redeploys. Preview URLs are created for other branches.

## Before going live

- [ ] Contact form: get a free access key at web3forms.com, paste it into `index.html` where it says `YOUR-WEB3FORMS-KEY`. Submissions arrive by email.
- [ ] Booking: set up a free Cal.com account, create a 60-minute "Look-round" event type with your availability, then in `index.html` uncomment the iframe and replace `YOUR-HANDLE`.
- [ ] Photos: replace the three `[Photo …]` placeholders on the home page and the ones on the work page. Put files in `assets/` and swap the placeholder text for an `<img>` as shown in the comment.
- [ ] Phone number: add it to the footer in both pages if you want it public.
- [ ] Prices: £350 / from £2,500 / from £150 are set in `index.html`. Change if needed.
- [ ] Automotive card: name the company on `work/index.html` only if you're clear to.
- [ ] OG image: make a 1200×630 `assets/og.png` (wordmark on stone) for link previews.
- [ ] Loftsoft company number in the footer, if Loftsoft is a Ltd.

## Adding a page

Copy `work/index.html` to `newpage/index.html`, keep the header and footer, change the `<title>`, description and canonical, add it to `sitemap.xml`.

## Blog

Start with `blog/index.html` and one HTML file per post. Past ten posts, add Astro or 11ty; the hosting doesn't change.
