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

- **`/admin/`**, the management panel, with three tabs:
  - **Leads**: filters, upcoming demos, conversion, status and internal notes, CSV export and
    delete (right to erasure). A won lead can become a client («Convertir en cliente»).
  - **Clientes** (`#clientes`): each customer's contract (plan, rooms, packages, SLA, agreed
    fee against the public price from `plans.ts`), their hotels (product project and tenant, panel,
    web, domain), links (Supabase, hosting, VPS…) and an **access register**: _where_ each
    credential is kept and when it expires, never the secret itself. MRR and access about to
    expire at the top.
  - **Facturación** (`#facturacion`): `generate_client_invoices()` creates the drafts of every
    active client on its due date (monthly, or yearly when paying annually) and the setup fee
    once. It runs daily with pg_cron at 06:00 UTC and on demand from the panel.
    `issue_client_invoice()` numbers them `MOS-<year>-0001…` and freezes the issuer (`sales_settings`,
    «Datos del emisor») and the client's details; once issued an invoice cannot be edited, only
    paid or cancelled. Pending, overdue, collected and CSV export. Each invoice opens as a
    document with the Melend/OS branding, printable or saved as PDF from the browser
    (`InvoiceDocument.tsx`; migration `20260929150000_billing_settings.sql`). VERI\*FACTU is not
    integrated yet (see `Cambiospendientes.md`).
  - Tables in migration `20260929120000_clients.sql`.
  - **Seguridad** (`#seguridad`): the IPs the panel opens from (`sales_allowed_ips`, migration
    `20260929140000_admin_ip_allowlist.sql`). Two layers over one list:
    - the page: `middleware.ts` (Vercel Routing Middleware on `/admin/*`) asks
      `admin_ip_allowed()` and answers 403 to any other IP;
    - the data: `is_sales_admin()`, which every policy uses, also requires the IP of the
      request, so the API returns nothing to an admin account connecting from elsewhere.
    - An empty list means no restriction. The first entry must include your own IP, and nobody
      can remove the range they are connected from.
    - The page and the database may see different addresses (IPv6 to Vercel, IPv4 to Supabase),
      so «Añadir mis IPs» adds both, IPv6 by its /64.
    - Locked out (new IP at home)? `node --env-file=.env scripts/admin-ips.mjs add <ip>`, or
      `clear` to remove the restriction.
  - Not indexed (`noindex`, `robots.txt`, out of the sitemap). Sign-in with email and password;
    public sign-up is disabled on the sales project.
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

- **Type**: Archivo (display: a sober, slightly narrow grotesque), Geist (UI and reading), Geist
  Mono (figures, times, room numbers). Self-hosted from `@fontsource` packages, all under the SIL Open Font License 1.1
  (commercial use allowed); no request to Google Fonts.
- **Motion**: [Motion](https://motion.dev) (MIT) for interactive bits (tab indicator, screen
  swaps, springs, cursor parallax); entrances and scroll reveals are CSS so the prerendered page
  paints without JavaScript. `prefers-reduced-motion` turns them off; without JavaScript nothing
  is hidden (`html.js` gates the reveals).
- **Icons**: Lucide (ISC), one family, stroke icons only.
- **Images**: `logo.webp` / `logo-dark.webp` (header and footer; the dark one has an ivory
  "Melend" and a lighter arch for navy backgrounds), `isologo-256.png`, `favicon.svg`,
  `melend-os.jpg` and `og.jpg` are Melend/OS brand assets (Dan). The logo files are cut from Dan's
  transparent PNG (kept outside git) without the English tagline.
  `hero-hotel-*.webp` (header background) is
  ["a hotel sign lit up against a dark sky"](https://unsplash.com/photos/E3Z7MmweGgc) by Ana
  Vieyra, free under the [Unsplash License](https://unsplash.com/license) (commercial use, no
  attribution required; credited here anyway). Mock-ups and illustrations are HTML/CSS/SVG.
- **Emphasis**: cards with `.glow` (rows: `.glow-row`) light up on hover and when scrolling brings
  them to the middle of the screen (`is-focus`, set in `mount.tsx`), so phones get the cue too.
