# Ey-aye — ey-aye.co.uk

> **This is the `wix` branch**: the site hosted on Wix, with the blog in Wix Blog. `main` is still the Cloudflare site, and pushing this branch doesn't change it.

An [Astro](https://astro.build) site, server-rendered on Wix's hosting (`@wix/astro` with the Wix hosting adapter). Pages render on each request, so a post published in the Wix dashboard is live straight away, with no rebuild. Code changes go live when a build is released to Wix.

```sh
npm install --ignore-scripts
cp .env.example .env.local   # once: the build checks these exist (the real values are set by Wix at release)
npm run build                # builds dist/ and .wix/, what gets released
npm run release              # wix release: needs `npx wix login` once
```

`npm run dev` needs the Wix CLI login too, since every page reads from Wix.

Site: `wix.config.json` (Wix site `e471bc0b-...`). Dashboard: https://manage.wix.com/dashboard/e471bc0b-830d-4071-899b-2441d9760126

## Writing a post

Posts are written and published in Wix: **Dashboard → Blog → Posts** (https://manage.wix.com/dashboard/e471bc0b-830d-4071-899b-2441d9760126/blog/posts). The address is the post's URL slug, under `/blog/<slug>/`.

- **Cover image:** 1600×900. It's the photo at the top of the post, and the card on the blog and home pages. Set its alt text.
- **Excerpt:** the line under the title on the blog page.
- **SEO (Post settings → SEO):** the Google description and social description. A title ending in a full stop gets the Rapeseed stop automatically.

Write the post in the Wix editor with these conventions, and the site turns each into its part of the design:

| In the editor | On the site |
|---|---|
| The first paragraph | The lead, under the headline |
| A quote that starts with a bold **Aye** or **Nay** | The aye/nay verdict box |
| An image, then a line in italics | The image with that line as its caption |
| A divider, then a last paragraph of bold text followed by a link | The teal call-to-action box (the bold text is the line, the link is the button) |

Links to `https://ey-aye.co.uk/...` work on any address the site is served from. Never change a published post's slug: the address changes, and Relay would treat it as a new post.

Everything else updates itself: the blog page, the newest three on the home page, Wix's sitemap, the RSS feeds at `/rss.xml` (ours) and `/blog-feed.xml` (Wix's), and each post's title, description and social tags (which you can edit per post in the dashboard).

## Booking a look-round (home page, `#book`)

The calendar in the Book section is the **Free look-round** service in Wix Bookings (slug `free-look-round`): one hour, at the client's place, free. Visitors pick a day and time, fill in the booking form and get Wix's confirmation email; the booking lands in **Dashboard → Bookings** (https://manage.wix.com/dashboard/e471bc0b-830d-4071-899b-2441d9760126/bookings/calendar).

Change it in the dashboard, not the code: the service's wording and length under **Bookings → Services**, when you're free under **Bookings → Availability** (Mon–Fri 10:00–18:00 to start), the form's fields under **Bookings → Settings → Booking form** (the calendar shows whatever fields are there), notice and cancellation rules under **Policies**. A free booking still needs a payment method switched on ("manual payments" is enough): **Settings → Accept payments**.

Code: `src/components/LookRoundBooking.astro` (the calendar's look) on Wix's shipped booking code in `src/wix/bookings/` (copy as-is; it owns the booking logic). If the service is renamed to a new slug, pass it: `<LookRoundBooking slug="…" />`.

## Client area (`/clients/`)

A private portal per client, built on Wix's own apps so you run it from the Wix dashboard. Clients sign in with Wix's login page (the **Client Login** link in the header and footer, which includes "forgotten password"). Member sign-up should be approval-only (**Dashboard → Settings → Member signup**) so only people you add get in. **Adding a client:** add them as a site member (Contacts or Site Members) and send their set-password email.

| Tab | What the client sees | Where you manage it |
|---|---|---|
| **Overview** | Their project's stage, "What's next" and due date; new files; the latest message; anything to pay | Their card in **CRM → Pipelines** (or the Pipelines tab on their contact): card name = project name, stage = where it's up to, description = "What's next", due date. Any pipeline works; a card shows when the client is its main or an additional contact |
| **Files** | Folders and files; upload, download (15-minute links), add/rename folders, move files | `/clients/admin/` (pick the client): all of that plus delete. Admins are listed in `ADMIN_MEMBER_IDS` in `src/lib/clients.ts` |
| **Messages** | Their conversation with you | **Wix Inbox** (dashboard, the Inbox tab on their contact, or the Wix app). Uploads post a note into the conversation, so Inbox tells you about them too |
| **Invoices** | Sent invoices with status, due date, and a link to Wix's page to view and pay | **Wix Invoices** (or the Invoices tab on their contact). Drafts and voided invoices don't show |
| **Account** | Edit name, business, phone; email themselves a set-password link | Their Wix contact |

Storage for files: private in the Media Manager under `client-documents/<memberId>/`; the CMS collections `ClientDocuments` (one row per file) and `ClientFolders` say whose they are and where they sit. Both are admin-only; the site reads them (and Inbox, Pipelines and Invoices) with elevated permissions and scopes everything to the signed-in member, or the client an admin picked. Uploads go from the browser straight to Wix and are only recorded if the file landed in that client's own Media folder. Code: `src/lib/clients.ts` (files, who's who), `src/lib/portal.ts` (Inbox, Pipelines, Invoices, account), `src/layouts/ClientArea.astro`, `src/components/ClientSpace.astro`, `src/pages/clients/`, `src/pages/api/clients/`. Tick **Hide from search engines** for the `/clients` pages in SEO Settings → Main Pages.

## Layout

```text
src/
  layouts/Base.astro Head, header, nav and footer for every page
  components/        PostCard (the blog cards)
  lib/posts.ts       Reads posts from Wix Blog; dates, image sizes, the article conventions above
  lib/clients.ts     The client area: who's signed in, their documents, download links
  wix/               Wix's shipped data layer for Wix Blog (copy as-is)
  pages/             One file per page; folder/index.astro → /folder/
  styles/style.css   The brand stylesheet (all colours and type live here)
public/              Copied as-is: assets/, favicon.svg, robots.txt, _headers, site.js
worker/index.js      The Cloudflare Worker (below), not used on Wix
cloudflare/          The Worker's wrangler config, moved aside so the Wix build ignores it
```

## Adding or editing a page

Pages are in `src/pages/`, one folder per page with an `index.astro`; the header, nav and footer are in `src/layouts/Base.astro`, once. To add one, copy `src/pages/build/index.astro` to `src/pages/newpage/index.astro`, change it, and release.

**Titles and descriptions live in Wix, not in the code.** Wix adds each page's title, description, canonical link and social tags itself, so the layout doesn't write them (two of each would confuse search engines). Set them in **Dashboard → SEO & GEO → SEO Settings → Main Pages**; a new page appears there after its first release. The `page` block at the top of each file still holds the wording, as the record of what to put in the dashboard. Blog posts take theirs from each post's own SEO settings. The sitemap at `/sitemap.xml` is Wix's, built from the same page list (`/_wix/pages.json`) and the blog.

## The Worker (`worker/index.js`)

**Not running on Wix.** On this branch:

- **The contact form** posts to `src/pages/api/enquiry.ts`, which saves it to the **Enquiry** form in Wix Forms (Dashboard → Forms & Submissions). Each enquiry creates or updates a contact, and Wix sends the notification email (set who gets it in the form's settings). The Wix form's fields: `name`, `business`, `email`, `message`, `heard_about`, `landing_page`, and `tracking` (the visit's utm tags and which ad platform, e.g. `source=facebook · medium=social · click=fbclid`). Change labels or the "How did you hear" options in the dashboard; keep a new option's wording the same in `src/pages/index.astro` and `HEARD_ABOUT` in the route.
- **Tagged-landing counts and `/stats`** aren't carried over: Wix Analytics in the dashboard shows traffic by source and campaign, and each enquiry keeps its tags in `tracking`.

The rest of this section describes `main`.


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
