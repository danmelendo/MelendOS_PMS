# Sales website (Melend/OS)

Landing to sell the product and capture leads: showcase, a page for hostels, a page on the
legal obligations (SES.HOSPEDAJES, VeriFactu), pricing with SLA, and demo booking.
**Independent from the product**: its own package, build, deployment and Supabase project. It
imports nothing from the app; the demo itself is shown in the call, from wherever the product is
hosted.

- `index.html`, `hostales/`, `normativa/`, `precios/`, `demo/`, `privacidad/`, `404.html`: one
  static page each (Vite multi-page, React), prerendered at build time.
- `src/seo.ts`: title, description, canonical path, sitemap entry and structured data (JSON-LD:
  Organization, SoftwareApplication with prices, FAQPage) of every page. A new page needs an
  entry here and in `scripts/prerender.mjs`.
- `src/`: pages, layout, product illustrations (`components/Mockups.tsx`), leads API client with
  campaign attribution (`utm_*`, referrer).
- `supabase/`: the **sales** Supabase project. `migrations/` (table `leads`), `functions/leads`
  (free slots and lead submission) and `functions/_shared/` (pure code shared with the site:
  `plans.ts` prices and SLA, `slots.ts` demo times in Madrid).
- Pricing rationale and open decisions: `PRICING.md`.

## Run

```sh
cd site
npm install
cp .env.example .env   # fill in the sales project URL and publishable key
npm run dev            # http://localhost:5173
npm run check          # typecheck + tests + build
```

Without `VITE_SALES_*` the site works but the demo form says it is not configured.

## Sales Supabase project (one-off)

A separate project, never the product's (demo or production). Once created:

```sh
cd site
set -a; . ./.env; set +a                     # SUPABASE_ACCESS_TOKEN of the sales account
npx supabase link --project-ref <sales-ref>
npx supabase db push
npx supabase functions deploy leads --use-api
npx supabase secrets set SITE_ORIGIN=https://<site-domain>              # CORS
npx supabase secrets set SALES_WEBHOOK_URL=<slack/discord/crm webhook>  # optional
```

Leads land in `public.leads` (dashboard → Table editor). Status: `new` → `confirmed` → `done` /
`won` / `lost` (`cancelled`, `no_show` free the slot). The table has no policies: only the
function (service role) touches it.

The function only returns free times, never who booked; it rejects bots with a honeypot field,
limits 3 leads per email and 5 per IP a day, and a unique index prevents double-booking a slot.

## Deploy on Vercel

Import the GitHub repository in Vercel with **Root Directory `site`** (framework Vite; build
settings come from `site/vercel.json`: `npm run build`, output `dist`, clean URLs with trailing
slash, long cache for `/assets`, security headers). Environment variables:

| Variable                  | Value                                                            |
| ------------------------- | ---------------------------------------------------------------- |
| `VITE_SALES_SUPABASE_URL` | `https://<sales-ref>.supabase.co`                                |
| `VITE_SALES_SUPABASE_KEY` | publishable key of the sales project (public by design)          |
| `VITE_SALES_EMAIL`        | contact email shown in the footer and when the form fails        |
| `VITE_SITE_URL`           | final domain, e.g. `https://melendos.es` (canonical and sitemap) |

Without `VITE_SITE_URL` the build uses Vercel's production domain. After the first deploy:
set `SITE_ORIGIN` on the sales Supabase project to that domain (CORS), add the domain to Google
Search Console and submit `/sitemap.xml`.

## SEO and ads

- The build prerenders every page (`scripts/prerender.mjs`): crawlers and link previews get the
  full HTML; React hydrates it in the browser. It also writes `sitemap.xml` and `robots.txt`.
- Share image: `public/og.png` (1200×630).
- The demo form pushes `{ event: "generate_lead", lead_kind, plan }` to `window.dataLayer` when a
  lead is sent: import it as a conversion in Google Ads / GA4 once a tag (e.g. Google Tag Manager
  with a cookie banner and Consent Mode) is installed. No tag is installed yet.
- Landing pages for ads: `/hostales/` and `/normativa/`. The site states that SES.HOSPEDAJES and
  VeriFactu are in development (`COMPLIANCE` in `plans.ts`); update it there when they ship.
