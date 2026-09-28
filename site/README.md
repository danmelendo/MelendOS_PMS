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

## Admin panel and lead emails

- **`/admin/`**: leads with filters, upcoming demos, conversion, status and internal notes,
  CSV export and delete (right to erasure). Not indexed (`noindex`, `robots.txt`, out of the
  sitemap). Sign-in with email and password; public sign-up is disabled on the sales project.
- **Who can see it**: users listed in `public.sales_admins` (RLS on `leads`; migration
  `20260927120000_sales_admins.sql`). To add someone: create the user in Supabase → Auth (or with
  the Auth admin API) and `insert into public.sales_admins (user_id, email) select id, email from
auth.users where email = '…';`
- **Email for every new lead** (function `leads`, via [Resend](https://resend.com)). Secrets on
  the sales project:

  | Secret                | Value                                                                            |
  | --------------------- | -------------------------------------------------------------------------------- |
  | `LEADS_NOTIFY_EMAIL`  | recipients, comma separated (set: `danielgomez@melendo.app`)                     |
  | `RESEND_API_KEY`      | Resend API key                                                                   |
  | `LEADS_FROM_EMAIL`    | sender of the internal email (set: `Melend/OS Leads <leads@melendo.app>`)        |
  | `SITE_URL`            | public URL of the site, for the "Abrir en el panel" link                         |
  | `CUSTOMER_FROM_EMAIL` | sender of the confirmation to the lead (set: `Melend/OS <melendOS@melendo.app>`) |

  The lead also gets a confirmation (the demo with a calendar file, or that we got the request;
  replies go to the first `LEADS_NOTIFY_EMAIL`). Both senders need `melendo.app` verified in
  Resend. Until then the internal email falls back to `onboarding@resend.dev` (Resend only delivers
  it to the Resend account's own address) and the lead gets no confirmation: the function returns
  `confirmation: false` and the demo page words its message accordingly. Email content:
  `supabase/functions/_shared/lead-email.ts` (tested).

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

## Design system and assets

"The front desk at night": night navy and brass from the staff panel, plus ivory, sand, stone
and a mineral green for states. Tokens, surfaces, buttons and motion live in `src/styles.css`;
product mock-ups sit inside `.product-ui`, which restores the panel's real colours.

- **Type**: Instrument Serif (display), Geist (UI and reading), Geist Mono (figures, times, room
  numbers). Self-hosted from `@fontsource` packages, all under the SIL Open Font License 1.1
  (commercial use allowed); no request to Google Fonts.
- **Motion**: [Motion](https://motion.dev) (MIT) for interactive bits (tab indicator, screen
  swaps, springs, cursor parallax); entrances and scroll reveals are CSS so the prerendered page
  paints without JavaScript. `prefers-reduced-motion` turns them off; without JavaScript nothing
  is hidden (`html.js` gates the reveals).
- **Icons**: Lucide (ISC), one family, stroke icons only.
- **Images**: `isologo.png`, `melend-os.jpg` and `og.jpg` are Melend/OS brand assets (Dan). No
  stock photography; mock-ups and illustrations are HTML/CSS/SVG.
