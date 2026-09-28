# Melend/OS · Hotel PMS and booking engine

> A multi-tenant SaaS for traditional hotels and hostels (stays by the night): a property
> management system for reception and management, a direct booking engine (the hotel's own
> template website or a widget embedded in the site it already has), guest self-service, Spanish
> regulatory compliance (SES.HOSPEDAJES, VERI\*FACTU) and an AI layer built on the same server
> rules.
>
> ⚠️ **Portfolio repository.** Every hotel, room, price and guest in it is fictitious. It holds
> no keys and no real data.

The day-to-day documentation of the project is in Spanish (`docs/`, `DEPLOY.md`,
`docs/estado-producto.md` for the product status). This README is the overview.

---

## What it does

**PMS (panel for the hotel's staff)**

- Today (arrivals, departures, in-house, occupancy), a rooms × days planning board and a side
  panel booking editor with live pricing.
- Nightly rates (weekday / weekend) and dynamic pricing by date and occupancy, night by night;
  extras, gifts by spend, promo codes, cleaning gaps between stays.
- Customers with sensitive data restricted to management (re-authentication, audit log), stay
  chat with guests, the stay's bill (charges, extensions, payment of the balance), reviews,
  reports (occupancy, ADR, RevPAR, lead time, cancellations and their reasons, channels).
- Team management with roles (reception, management, read-only group management), two-step
  verification enforced in the database, and "Activity and consumption" (AI usage and cost,
  sending queues, storage, recent errors).

**Booking engine and guest self-service**

- Availability with a price-per-night calendar, pay online in full or at the hotel, per-hotel
  cancellation policy copied into each booking, promo codes redeemed on the server.
- "My booking": look up by reference + email or sign in; stay chat with reception, the bill,
  invoices, reviews, free cancellation within the window or a request to the hotel.
- Online check-in: the guests fill in the traveller register required by Spanish law, then sign.
- Confirmation and cancellation emails, legal pages generated from the hotel's data, Spanish and
  English throughout (guest's language kept for emails).
- Each hotel on its own domain or subdomain, a template website edited from the panel, and a
  one-line widget (`embed.js`) with search and the booking assistant for the hotel's own site.

**Compliance (Spain)**

- **SES.HOSPEDAJES**: booking and traveller reports to the Ministry of the Interior (XML, ZIP,
  SOAP), queued by database triggers and sent on a schedule with retries.
- **VERI\*FACTU**: invoices, simplified and corrective invoices and cancellations with the chained
  SHA-256 fingerprint (checked against the official AEAT vectors), XML validated against the
  official XSD, QR code, mutual-TLS submission and flow control.

Both are verified against simulated endpoints; certification against the real ones is pending.

**AI layer** (any OpenAI-compatible model; a local 7B model in development)

- **Booking assistant** on the website: searches, quotes, books, recovers a lost reference and
  cancels in two steps, with guard-rails on the server (tenant fixed server-side, links never
  pass through the model, fabricated claims are caught).
- **MCP server** per hotel: the same typed tools for Claude or other assistants, with read or
  read/write tokens.
- **Management copilot**: business questions answered with predefined read-only tools rather
  than model-written SQL (safer, reliable with small models, bounded cost), run with the user's
  own session so row-level security still applies.
- Automated evals against a real model and the demo database, scoring what the assistant does.

**Distribution and data**

- A provider-neutral channel layer (OTAs, channel managers, tour operators): signed inbound
  webhooks and outbound availability/price messages; only the demo adapter exists so far.
- Two years of simulated history and a daily Parquet export to a data lake (the contract for the
  ML work is in `lake/README.md`).

## Architecture

```
src/                      React SPA (TanStack Start/Router, Tailwind v4, shadcn, TanStack Query)
  routes/_app.*           Panel
  routes/web.*, embed.*   Booking web and embeddable widget
  lib/                    Hooks, i18n (Spanish text as key + English dictionary)
supabase/
  migrations/             Schema: tenant_id + RLS on every table, SQL functions, triggers
  functions/<fn>/         Edge Functions (Deno)
  functions/_shared/      Business rules in plain TypeScript (@domain), typed tools (Zod),
                          agent loop, MCP server, copilot, channels, SES, VERI*FACTU, email
  tests/                  Permission and rule tests against Postgres
lake/                     Daily export to Parquet (Python + DuckDB)
scripts/                  End-to-end checks, onboarding, operations
site/                     The commercial website (separate project)
```

Principles:

- **The tenant is always fixed by the server**, never by the client or the model. Every table
  carries `tenant_id` with row-level security; composite foreign keys keep rows within a hotel.
- **Business rules live once**, in plain TypeScript shared by the browser and the Edge
  Functions; where the database needs them, an SQL mirror with a parity test.
- **Nothing irreversible without a human**: the hotel decides late cancellations; the guest
  confirms a free cancellation in a separate message.
- **Queues in the database** (SES, VERI\*FACTU, guest emails, channels) drained by `pg_cron` +
  `pg_net` calling Edge Functions; an hourly check opens an issue when a queue is stuck.
- **Demo = pre-production**: the same code and schema as production; only configuration and seed
  data differ.

## Getting started

```bash
npm install
cp .env.example .env   # fill in a Supabase project (the demo one in development)
npm run dev
```

| Route    | What it is                                                       |
| -------- | ---------------------------------------------------------------- |
| `/web`   | A hotel's booking website (`?lang=en` for English)               |
| `/today` | The panel; in the demo you pick a fictitious account from a list |

## Quality

| Command                                       | What it checks                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                               | Typecheck, lint, unit tests (200+) and build, as the CI does                                                                                 |
| `npm run test:db`                             | Permissions and rules against Postgres (75+ scenarios)                                                                                       |
| `node --env-file=.env scripts/e2e-*.mjs`      | End-to-end flows against the demo project (payments, folio, MCP, channels, SES, VERI\*FACTU, promo codes and emails, two-step verification…) |
| `npm run eval:agent` / `npm run eval:copilot` | The assistants against a real model                                                                                                          |

Every change goes through a pull request to `main` with the CI green; merging deploys the
migrations and Edge Functions to the demo (pre-production).

## Stack

TypeScript everywhere; React 19, Vite, TanStack Start/Router and Query, Tailwind CSS v4,
Radix/shadcn, Zod; Supabase (Postgres 17, row-level security, Auth with TOTP, Edge Functions on
Deno, Storage, Vault, pg_cron, pg_net); Redsys and Stripe payment gateways; Resend for email;
Vitest; Python + DuckDB for the data lake; GitHub Actions.
