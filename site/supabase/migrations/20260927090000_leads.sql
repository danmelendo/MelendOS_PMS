-- ─────────────────────────────────────────────────────────────────────────────
-- Sales project (separate from the product's Supabase): leads from the
-- website. A lead either books a demo call (slot_start) or asks to be
-- contacted. Attribution (utm_*, referrer, page) to know which campaign works.
--
-- No policies and nothing granted to anon/authenticated: only the leads Edge
-- Function (service role) writes, and it only ever returns which slots are
-- taken, never who took them. Sales reads it from the dashboard.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('demo', 'contact')),
  slot_start    timestamptz,
  name          text not null check (char_length(btrim(name)) between 2 and 120),
  email         text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone         text check (char_length(phone) <= 40),
  company       text not null check (char_length(btrim(company)) between 2 and 160),
  hotels        integer not null default 1 check (hotels between 1 and 500),
  rooms         integer check (rooms between 1 and 20000),
  plan          text check (plan in ('starter', 'pro', 'group')),
  message       text check (char_length(message) <= 2000),
  -- GDPR: the visitor accepted the privacy notice (and whether they want news).
  privacy_ok    boolean not null check (privacy_ok),
  marketing_ok  boolean not null default false,
  utm_source    text check (char_length(utm_source) <= 100),
  utm_medium    text check (char_length(utm_medium) <= 100),
  utm_campaign  text check (char_length(utm_campaign) <= 100),
  referrer      text check (char_length(referrer) <= 500),
  page          text check (char_length(page) <= 200),
  status        text not null default 'new'
                check (status in ('new', 'confirmed', 'done', 'won', 'lost', 'cancelled', 'no_show')),
  notes         text,
  -- SHA-256 of the caller's IP, only to rate-limit abuse.
  ip_hash       text,
  created_at    timestamptz not null default now(),
  check ((kind = 'demo') = (slot_start is not null))
);

-- One live call per slot: a second booking of the same time fails.
create unique index leads_slot_idx on public.leads (slot_start)
  where slot_start is not null and status in ('new', 'confirmed');
create index leads_email_idx on public.leads (lower(email), created_at desc);
create index leads_ip_idx on public.leads (ip_hash, created_at desc);
create index leads_created_idx on public.leads (created_at desc);

alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

comment on table public.leads is
  'Leads and demo calls from the sales website. Service role only (leads Edge Function).';
