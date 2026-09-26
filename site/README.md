# Sales website

Landing to sell the product and capture leads: showcase, pricing with SLA, and demo booking.
**Independent from the product**: its own package, build, deployment and Supabase project. It
imports nothing from the app; the demo itself is shown in the call, from wherever the product is
hosted.

- `index.html`, `precios/`, `demo/`, `privacidad/`: one static page each (Vite multi-page, React).
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

## Deploy the site

Any static host (Netlify, Cloudflare Pages, Vercel): base directory `site`, build `npm run build`,
output `site/dist`, environment variables `VITE_SALES_SUPABASE_URL`, `VITE_SALES_SUPABASE_KEY`,
`VITE_SALES_EMAIL`.
