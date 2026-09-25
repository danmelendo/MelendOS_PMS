-- ─────────────────────────────────────────────────────────────────────────────
-- Demo Stays: base schema (multi-tenant SaaS for nightly hotels)
--
-- One migration with the whole structure. Every business table carries
-- tenant_id; child tables reference parents through (tenant_id, id) so a row
-- can never point at another tenant's data, and RLS scopes every read and write
-- to the caller's tenants.
--
-- Roles:
--   anon           public web: reads the active catalogue only.
--   authenticated  hotel staff (tenant_members) and guests (members).
--   service_role   Edge Functions and scripts (bypasses RLS).
--
-- Functions: EXECUTE is revoked from PUBLIC by default and granted explicitly,
-- so no SECURITY DEFINER function is callable by anyone by accident.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists btree_gist with schema extensions;

-- Functions are not executable by PUBLIC unless granted below.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.staff_role as enum ('admin', 'reception');
create type public.tenant_status as enum ('trial', 'active', 'suspended');
create type public.room_status as enum ('available', 'occupied', 'cleaning', 'out_of_service');
create type public.room_category as enum ('room', 'suite', 'family');
create type public.reservation_status as enum (
  'pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rejected'
);
create type public.dynamic_rule_type as enum ('occupancy', 'date');
create type public.extra_category as enum ('breakfast', 'parking', 'wellness', 'experiences', 'services');
create type public.payment_provider as enum ('redsys', 'stripe');
create type public.payment_status as enum ('created', 'succeeded', 'failed', 'refunded');

-- ── Helpers ──────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Tenants and staff ────────────────────────────────────────────────────────
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name        text not null,
  -- Custom domain or subdomain the public web answers on.
  domain      text unique,
  status      public.tenant_status not null default 'trial',
  plan        text not null default 'starter',
  -- Brand shown on the public web and guest app (accent, hero copy…).
  brand       jsonb not null default '{}'::jsonb,
  -- Operational settings: check-in/out hours, deposit %, currency, timezone.
  settings    jsonb not null default
    '{"checkin_hour":15,"checkout_hour":12,"deposit_pct":30,"currency":"EUR","timezone":"Europe/Madrid"}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.staff_role not null,
  created_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user_idx on public.tenant_members (user_id);

-- Membership checks used by RLS. SECURITY DEFINER so policies can read
-- tenant_members without exposing it.
create or replace function public.is_tenant_member(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant and user_id = auth.uid()
  );
$$;

create or replace function public.has_tenant_role(p_tenant uuid, p_role public.staff_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant and user_id = auth.uid() and role = p_role
  );
$$;

-- Tenant for inserts when the client doesn't send tenant_id: the x-tenant-id
-- request header if present, otherwise the caller's only tenant. RLS still
-- checks the caller really belongs to it.
create or replace function public.current_tenant_id()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_header text;
  v_tenant uuid;
begin
  begin
    v_header := current_setting('request.headers', true)::json ->> 'x-tenant-id';
  exception when others then
    v_header := null;
  end;
  if v_header is not null and v_header <> '' then
    return v_header::uuid;
  end if;
  select tenant_id into v_tenant
  from public.tenant_members
  where user_id = auth.uid();
  if found and (select count(*) from public.tenant_members where user_id = auth.uid()) = 1 then
    return v_tenant;
  end if;
  return null;
end;
$$;

-- ── Catalogue ────────────────────────────────────────────────────────────────
-- "provinces" are destinations; "properties" are the tenant's hotels.
create table public.provinces (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  name        text not null,
  accent      text not null default '214 51% 25%',
  tagline     text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.properties (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  province_id  uuid,
  name         text not null,
  city         text not null,
  address      text,
  rating       numeric(2,1),
  amenities    text[] not null default '{}',
  description  text,
  brand        text,
  image_url    text,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, province_id) references public.provinces (tenant_id, id)
);

create table public.rate_groups (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table public.rate_nightly (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  rate_group_id  uuid not null,
  price          numeric(10,2) not null check (price >= 0),
  weekend_price  numeric(10,2) check (weekend_price >= 0),
  unique (tenant_id, rate_group_id),
  foreign key (tenant_id, rate_group_id) references public.rate_groups (tenant_id, id) on delete cascade
);

create table public.rooms (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  property_id    uuid not null,
  -- Hotel label used by the staff panel for grouping.
  building       text not null,
  name           text not null,
  capacity       integer not null default 2 check (capacity between 1 and 12),
  asset_type     public.room_category not null default 'room',
  features       text[] not null default '{}',
  status         public.room_status not null default 'available',
  rate_group_id  uuid,
  description    text,
  image_url      text,
  has_tv         boolean not null default true,
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (tenant_id, id),
  unique (property_id, name),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id),
  foreign key (tenant_id, rate_group_id) references public.rate_groups (tenant_id, id)
);

create table public.extras (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  category     public.extra_category not null,
  name         text not null,
  price        numeric(10,2) not null check (price >= 0),
  description  text,
  image_url    text,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.gift_thresholds (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  min_extras_total  numeric(10,2) not null check (min_extras_total >= 0),
  gift_extra_id     uuid not null,
  active            boolean not null default true,
  unique (tenant_id, min_extras_total),
  foreign key (tenant_id, gift_extra_id) references public.extras (tenant_id, id) on delete cascade
);

create table public.dynamic_rules (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  type        public.dynamic_rule_type not null,
  name        text not null,
  -- date: {"from":"yyyy-MM-dd","to":"yyyy-MM-dd"}; occupancy: {"threshold":70}
  config      jsonb not null default '{}'::jsonb,
  multiplier  numeric(5,2) not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.promo_codes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  code            text not null,
  discount_type   text not null check (discount_type in ('percent', 'fixed')),
  discount_value  numeric(10,2) not null check (discount_value > 0),
  valid_from      timestamptz not null default now(),
  valid_until     timestamptz,
  single_use      boolean not null default false,
  max_uses        integer check (max_uses is null or max_uses > 0),
  times_used      integer not null default 0,
  active          boolean not null default true,
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index promo_codes_code_active_unique
  on public.promo_codes (tenant_id, upper(code)) where not archived;

-- ── Guests ───────────────────────────────────────────────────────────────────
-- Staff-facing guest records (anyone who booked).
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  name        text,
  phone       text,
  email       text,
  no_contact  boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id)
);
create index customers_tenant_email_idx on public.customers (tenant_id, lower(email));
create index customers_tenant_phone_idx on public.customers (tenant_id, phone);

-- Guest accounts of the guest app (optional login), one per tenant and user.
create table public.members (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,
  name           text not null,
  email          text not null,
  phone          text,
  member_number  text not null,
  created_at     timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, user_id),
  unique (tenant_id, member_number)
);

create or replace function public.is_member_user(p_tenant uuid, p_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where tenant_id = p_tenant and id = p_member and user_id = auth.uid()
  );
$$;

-- ── Reservations ─────────────────────────────────────────────────────────────
create table public.reservations (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  room_id                     uuid not null,
  property_id                 uuid,
  customer_id                 uuid,
  member_id                   uuid,
  start_at                    timestamptz not null,
  end_at                      timestamptz not null,
  people                      integer not null default 2 check (people > 0),
  cleaning_minutes            integer not null default 15 check (cleaning_minutes >= 15),
  base_price                  numeric(10,2) not null default 0,
  dynamic_surcharge           numeric(10,2) not null default 0,
  dynamic_reason              text,
  extras_total                numeric(10,2) not null default 0,
  discount_amount             numeric(10,2) not null default 0,
  promo_code_id               uuid,
  total                       numeric(10,2) not null default 0,
  deposit_amount              numeric(10,2) not null default 0,
  deposit_paid                boolean not null default false,
  paid_amount                 numeric(10,2) not null default 0,
  status                      public.reservation_status not null default 'pending',
  internal_notes              text,
  cancellation_reason         text,
  manual_override             boolean not null default false,
  is_prebooking               boolean not null default false,
  hold_expires_at             timestamptz,
  created_by                  uuid references auth.users(id) on delete set null,
  created_by_role             text,
  -- Provider order reference of the latest payment (kept for the panel).
  redsys_order                text,
  confirmation_email_sent_at  timestamptz,
  confirmation_email_error    text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  check (end_at > start_at),
  unique (tenant_id, id),
  foreign key (tenant_id, room_id) references public.rooms (tenant_id, id) on delete restrict,
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id),
  foreign key (tenant_id, member_id) references public.members (tenant_id, id),
  foreign key (tenant_id, promo_code_id) references public.promo_codes (tenant_id, id)
);
create index reservations_room_time_idx on public.reservations (room_id, start_at, end_at);
create index reservations_tenant_start_idx on public.reservations (tenant_id, start_at);
create index reservations_member_idx on public.reservations (member_id);
create trigger reservations_updated_at before update on public.reservations
  for each row execute function public.set_updated_at();

-- Cleaning buffer: a reservation occupies its room for
-- [start_at, end_at + cleaning_minutes). Mirrors @domain/availability.ts.
create or replace function public.check_reservation_gap()
returns trigger language plpgsql as $$
begin
  if new.status in ('cancelled', 'no_show', 'rejected') or new.manual_override then
    return new;
  end if;
  if exists (
    select 1 from public.reservations r
    where r.room_id = new.room_id
      and r.id <> new.id
      and (
        r.status in ('confirmed', 'in_progress', 'completed')
        or (r.status = 'pending' and r.created_at > now() - interval '60 minutes')
      )
      and tstzrange(r.start_at, r.end_at + make_interval(mins => r.cleaning_minutes), '[)')
          && tstzrange(new.start_at, new.end_at + make_interval(mins => new.cleaning_minutes), '[)')
  ) then
    raise exception 'Conflicto de reserva: la habitación necesita al menos % minutos de limpieza entre reservas',
      new.cleaning_minutes using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;
create trigger reservations_gap_check before insert or update on public.reservations
  for each row execute function public.check_reservation_gap();

-- Public bookings cannot target a room that is out of service or in cleaning.
create or replace function public.check_room_available_for_public()
returns trigger language plpgsql as $$
declare
  v_status public.room_status;
begin
  if new.created_by_role is distinct from 'public' then
    return new;
  end if;
  select status into v_status from public.rooms where id = new.room_id;
  if v_status is distinct from 'available' then
    raise exception 'La habitación no está disponible para reservar (estado: %)', coalesce(v_status::text, 'desconocido')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger reservations_public_room_check before insert on public.reservations
  for each row execute function public.check_room_available_for_public();

create table public.reservation_extras (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  reservation_id  uuid not null,
  extra_id        uuid not null,
  qty             integer not null default 1 check (qty > 0),
  unit_price      numeric(10,2) not null check (unit_price >= 0),
  is_gift         boolean not null default false,
  created_at      timestamptz not null default now(),
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete cascade,
  foreign key (tenant_id, extra_id) references public.extras (tenant_id, id) on delete restrict
);
create index reservation_extras_reservation_idx on public.reservation_extras (reservation_id);

-- ── Payments ─────────────────────────────────────────────────────────────────
-- Gateway configuration per tenant. Public settings only: secrets live in
-- Supabase Vault under the name in secret_name and are read by Edge Functions.
create table public.payment_accounts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  provider     public.payment_provider not null,
  test_mode    boolean not null default true,
  -- e.g. Redsys merchant code + terminal; Stripe publishable key.
  public_config jsonb not null default '{}'::jsonb,
  secret_name  text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (tenant_id, provider)
);

-- Every payment attempt, whatever the provider. A reservation is confirmed only
-- when the provider's signed notification is verified (status 'succeeded').
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  reservation_id  uuid not null,
  provider        public.payment_provider not null,
  provider_ref    text not null,
  amount          numeric(10,2) not null check (amount > 0),
  currency        text not null default 'EUR',
  status          public.payment_status not null default 'created',
  verified_at     timestamptz,
  raw_notification jsonb,
  created_at      timestamptz not null default now(),
  unique (provider, provider_ref),
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete cascade
);

-- ── Guest app ────────────────────────────────────────────────────────────────
create table public.loyalty_tiers (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  name             text not null,
  min_points       integer not null default 0,
  points_per_euro  numeric(4,2) not null default 1,
  perks            text[] not null default '{}',
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.loyalty_accounts (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  member_id        uuid not null,
  points           integer not null default 0 check (points >= 0),
  lifetime_points  integer not null default 0,
  tier_id          uuid,
  member_since     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (tenant_id, member_id),
  foreign key (tenant_id, member_id) references public.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, tier_id) references public.loyalty_tiers (tenant_id, id)
);

create table public.loyalty_transactions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  member_id       uuid not null,
  type            text not null check (type in ('earn', 'redeem')),
  points          integer not null,
  reason          text not null,
  reservation_id  uuid,
  created_at      timestamptz not null default now(),
  foreign key (tenant_id, member_id) references public.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete set null (reservation_id)
);

create table public.rewards (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  name         text not null,
  cost_points  integer not null check (cost_points > 0),
  category     text not null,
  description  text,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

-- Online check-in: guest registration signed by the guest.
create table public.signatures (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  reservation_id  uuid not null,
  doc_type        text not null check (doc_type in ('guest_registration', 'terms')),
  signer_name     text not null,
  signature_data  text,
  status          text not null default 'pending' check (status in ('pending', 'signed')),
  signed_at       timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete cascade
);

-- Append-only booking lifecycle, shared by the panel and the guest app.
create table public.booking_journal (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  booking_ref  text not null,
  member_id    uuid,
  property_id  uuid,
  event_type   text not null,
  actor        text not null,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index booking_journal_tenant_idx on public.booking_journal (tenant_id, created_at desc);

create table public.availability_watches (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  member_id    uuid not null,
  property_id  uuid not null,
  room_id      uuid not null,
  check_in     date not null,
  check_out    date not null,
  guests       integer not null default 2,
  status       text not null default 'watching' check (status in ('watching', 'available', 'cancelled')),
  notified_at  timestamptz,
  created_at   timestamptz not null default now(),
  check (check_out > check_in),
  foreign key (tenant_id, member_id) references public.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, room_id) references public.rooms (tenant_id, id) on delete cascade
);

-- Bookable hotel facilities (spa, padel, meeting room…).
create table public.common_spaces (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  property_id     uuid not null,
  name            text not null,
  kind            text not null check (kind in ('spa', 'gym', 'padel', 'meeting', 'rooftop', 'pool')),
  capacity        integer not null default 1,
  description     text,
  open_hour       integer not null check (open_hour between 0 and 23),
  close_hour      integer not null check (close_hour between 1 and 24),
  price_per_hour  numeric(10,2) not null default 0,
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  check (close_hour > open_hour),
  unique (tenant_id, id),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id) on delete cascade
);

create table public.space_bookings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  member_id   uuid not null,
  space_id    uuid not null,
  date        date not null,
  start_hour  integer not null,
  end_hour    integer not null,
  guests      integer not null default 1,
  total       numeric(10,2) not null default 0,
  status      text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at  timestamptz not null default now(),
  check (end_hour > start_hour),
  foreign key (tenant_id, member_id) references public.members (tenant_id, id) on delete cascade,
  foreign key (tenant_id, space_id) references public.common_spaces (tenant_id, id) on delete cascade
);
-- One confirmed booking per facility slot.
alter table public.space_bookings add constraint space_bookings_no_overlap
  exclude using gist (
    space_id with =,
    date with =,
    int4range(start_hour, end_hour) with &&
  ) where (status = 'confirmed');

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  member_id      uuid not null,
  number         text not null,
  concept        text not null,
  property_name  text,
  issued_at      date not null,
  due_at         date not null,
  net            numeric(10,2) not null,
  tax            numeric(10,2) not null,
  amount         numeric(10,2) not null,
  status         text not null check (status in ('paid', 'pending', 'overdue')),
  unique (tenant_id, number),
  foreign key (tenant_id, member_id) references public.members (tenant_id, id) on delete cascade
);

-- Guest requests during the stay.
create table public.incidents (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  member_id      uuid not null,
  property_name  text,
  category       text not null check (category in ('housekeeping', 'maintenance', 'climate', 'internet', 'room_service', 'other')),
  title          text not null,
  description    text not null,
  status         text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  updates        jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  foreign key (tenant_id, member_id) references public.members (tenant_id, id) on delete cascade
);

-- Hotel experiences (the CMS content behind CmsClient).
create table public.experiences (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  property_id  uuid not null,
  title        text not null,
  summary      text not null,
  description  text,
  category     text not null check (category in ('gastronomy', 'wellness', 'culture', 'outdoor', 'family')),
  starts_at    timestamptz not null,
  location     text not null,
  capacity     integer not null check (capacity > 0),
  attending    integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id) on delete cascade
);

-- ── Audit, events and usage ──────────────────────────────────────────────────
create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  entity     text not null,
  entity_id  uuid,
  action     text not null,
  user_id    uuid references auth.users(id) on delete set null,
  payload    jsonb,
  at         timestamptz not null default now()
);

-- Business events, append-only. Source for the data lake, ML and metrics.
create table public.domain_events (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  event_type    text not null,
  entity        text not null,
  entity_id     uuid not null,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid,
  payload       jsonb not null default '{}'::jsonb
);
create index domain_events_tenant_time_idx on public.domain_events (tenant_id, occurred_at);

-- Metered usage per tenant (agent tokens, storage, runs…), for passing costs on.
create table public.usage_events (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  metric       text not null,
  quantity     numeric not null,
  unit         text not null,
  occurred_at  timestamptz not null default now(),
  metadata     jsonb not null default '{}'::jsonb
);
create index usage_events_tenant_metric_idx on public.usage_events (tenant_id, metric, occurred_at);

-- One row per AI agent execution (cost, latency, tools, outcome).
create table public.agent_runs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  channel         text not null check (channel in ('web_chat', 'mcp', 'admin_copilot', 'eval')),
  model           text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  cost_usd        numeric(10,6) not null default 0,
  latency_ms      integer,
  tools_called    text[] not null default '{}',
  outcome         text not null check (outcome in ('answered', 'booking_draft', 'payment_link', 'handoff', 'refused', 'error')),
  error           text,
  created_at      timestamptz not null default now()
);
create index agent_runs_tenant_time_idx on public.agent_runs (tenant_id, created_at desc);

-- Reservation changes → domain_events.
create or replace function public.log_reservation_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type text;
begin
  if tg_op = 'INSERT' then
    v_type := 'reservation.created';
  elsif new.status is distinct from old.status then
    v_type := 'reservation.' || new.status::text;
  elsif (new.start_at, new.end_at, new.room_id, new.total)
        is distinct from (old.start_at, old.end_at, old.room_id, old.total) then
    v_type := 'reservation.modified';
  else
    return new;
  end if;
  insert into public.domain_events (tenant_id, event_type, entity, entity_id, actor_id, payload)
  values (
    new.tenant_id, v_type, 'reservation', new.id, auth.uid(),
    jsonb_build_object(
      'room_id', new.room_id,
      'property_id', new.property_id,
      'status', new.status,
      'start_at', new.start_at,
      'end_at', new.end_at,
      'people', new.people,
      'total', new.total,
      'dynamic_surcharge', new.dynamic_surcharge,
      'channel', new.created_by_role,
      'lead_time_days', round(extract(epoch from (new.start_at - new.created_at)) / 86400.0, 1)
    )
  );
  return new;
end;
$$;
create trigger reservations_domain_events after insert or update on public.reservations
  for each row execute function public.log_reservation_event();

-- ── Row Level Security ───────────────────────────────────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array[
    'tenants','tenant_members','provinces','properties','rate_groups','rate_nightly','rooms',
    'extras','gift_thresholds','dynamic_rules','promo_codes','customers','members',
    'reservations','reservation_extras','payment_accounts','payments','loyalty_tiers',
    'loyalty_accounts','loyalty_transactions','rewards','signatures','booking_journal',
    'availability_watches','common_spaces','space_bookings','invoices','incidents',
    'experiences','audit_log','domain_events','usage_events','agent_runs'
  ])
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Tenants: public fields of active tenants are readable (the web needs brand
-- and settings); only admins edit their own tenant.
create policy tenants_public_read on public.tenants
  for select to anon, authenticated using (status in ('trial', 'active'));
create policy tenants_admin_update on public.tenants
  for update to authenticated
  using (public.has_tenant_role(id, 'admin')) with check (public.has_tenant_role(id, 'admin'));

create policy tenant_members_read on public.tenant_members
  for select to authenticated using (user_id = auth.uid() or public.has_tenant_role(tenant_id, 'admin'));
create policy tenant_members_admin_write on public.tenant_members
  for all to authenticated
  using (public.has_tenant_role(tenant_id, 'admin')) with check (public.has_tenant_role(tenant_id, 'admin'));

-- Public catalogue: everyone reads the active rows, all staff of the tenant read
-- everything (inactive rows included), admins manage it.
do $$
declare t text;
begin
  for t in select unnest(array[
    'provinces','properties','rate_groups','rate_nightly','rooms','extras','gift_thresholds',
    'dynamic_rules','loyalty_tiers','rewards','common_spaces','experiences'
  ])
  loop
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (%s)',
      t || '_public_read', t,
      case when t in ('provinces','rate_groups','rate_nightly','loyalty_tiers') then 'true' else 'active' end);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_tenant_member(tenant_id))',
      t || '_staff_read', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_tenant_role(tenant_id, %L)) with check (public.has_tenant_role(tenant_id, %L))',
      t || '_admin_write', t, 'admin', 'admin');
  end loop;
end $$;

-- Promo codes: staff read, admins manage. The public validates codes through
-- validate_promo_code() only.
create policy promo_codes_staff_read on public.promo_codes
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy promo_codes_admin_write on public.promo_codes
  for all to authenticated
  using (public.has_tenant_role(tenant_id, 'admin')) with check (public.has_tenant_role(tenant_id, 'admin'));

-- Operational tables: any staff member of the tenant can read and write.
do $$
declare t text;
begin
  for t in select unnest(array['customers','reservations','reservation_extras','audit_log','booking_journal'])
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id))',
      t || '_staff_all', t);
  end loop;
end $$;

-- Guest data: staff of the tenant manage it; guests see their own rows.
do $$
declare t text;
begin
  for t in select unnest(array[
    'members','loyalty_accounts','loyalty_transactions','signatures','availability_watches',
    'space_bookings','invoices','incidents'
  ])
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id))',
      t || '_staff_all', t);
  end loop;
end $$;

create policy members_self_read on public.members
  for select to authenticated using (user_id = auth.uid());
create policy reservations_guest_read on public.reservations
  for select to authenticated using (member_id is not null and public.is_member_user(tenant_id, member_id));
do $$
declare t text;
begin
  for t in select unnest(array[
    'loyalty_accounts','loyalty_transactions','availability_watches','space_bookings','invoices','incidents'
  ])
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_member_user(tenant_id, member_id))',
      t || '_guest_read', t);
  end loop;
  -- Guests create their own requests, watches and facility bookings.
  for t in select unnest(array['availability_watches','space_bookings','incidents'])
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_member_user(tenant_id, member_id))',
      t || '_guest_insert', t);
  end loop;
end $$;
create policy availability_watches_guest_update on public.availability_watches
  for update to authenticated
  using (public.is_member_user(tenant_id, member_id)) with check (public.is_member_user(tenant_id, member_id));
create policy space_bookings_guest_cancel on public.space_bookings
  for update to authenticated
  using (public.is_member_user(tenant_id, member_id))
  with check (public.is_member_user(tenant_id, member_id) and status = 'cancelled');
create policy signatures_guest_read on public.signatures
  for select to authenticated using (
    exists (select 1 from public.reservations r
            where r.tenant_id = signatures.tenant_id and r.id = signatures.reservation_id
              and r.member_id is not null and public.is_member_user(r.tenant_id, r.member_id))
  );
create policy signatures_guest_insert on public.signatures
  for insert to authenticated with check (
    exists (select 1 from public.reservations r
            where r.tenant_id = signatures.tenant_id and r.id = signatures.reservation_id
              and r.member_id is not null and public.is_member_user(r.tenant_id, r.member_id))
  );

-- Payments and gateway config: admins read; writes only from Edge Functions
-- (service_role bypasses RLS).
create policy payment_accounts_admin_read on public.payment_accounts
  for select to authenticated using (public.has_tenant_role(tenant_id, 'admin'));
create policy payments_staff_read on public.payments
  for select to authenticated using (public.is_tenant_member(tenant_id));

-- Events, usage and agent runs: read-only for admins; written by triggers and
-- Edge Functions. No update/delete policies: append-only.
create policy domain_events_admin_read on public.domain_events
  for select to authenticated using (public.has_tenant_role(tenant_id, 'admin'));
create policy usage_events_admin_read on public.usage_events
  for select to authenticated using (public.has_tenant_role(tenant_id, 'admin'));
create policy agent_runs_admin_read on public.agent_runs
  for select to authenticated using (public.has_tenant_role(tenant_id, 'admin'));
revoke update, delete, truncate on public.domain_events, public.usage_events from anon, authenticated;

-- ── Functions callable by clients ────────────────────────────────────────────
-- Busy windows of a tenant's rooms (no guest data), for public availability.
create or replace function public.room_busy_windows(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (room_id uuid, start_at timestamptz, end_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.room_id, r.start_at, r.end_at + make_interval(mins => r.cleaning_minutes)
  from public.reservations r
  where r.tenant_id = p_tenant
    and r.start_at < p_to
    and r.end_at > p_from
    and (
      r.status in ('confirmed', 'in_progress', 'completed')
      or (r.status = 'pending' and (r.created_at > now() - interval '60 minutes'
          or (r.is_prebooking and r.hold_expires_at > now())))
    );
$$;

create or replace function public.validate_promo_code(p_tenant uuid, p_code text)
returns table (id uuid, code text, discount_type text, discount_value numeric)
language sql stable security definer set search_path = public as $$
  select pc.id, pc.code, pc.discount_type, pc.discount_value
  from public.promo_codes pc
  where pc.tenant_id = p_tenant
    and upper(pc.code) = upper(trim(p_code))
    and pc.active and not pc.archived
    and pc.valid_from <= now()
    and (pc.valid_until is null or pc.valid_until >= now())
    and case
          when pc.single_use then pc.times_used < 1
          when pc.max_uses is not null then pc.times_used < pc.max_uses
          else true
        end
  limit 1;
$$;

-- Staff only: extend a reservation's cleaning time and shift the following
-- reservations of the room. Mirrors @domain/availability.ts planCleaningShift.
create or replace function public.extend_cleaning_and_shift(p_reservation_id uuid, p_cleaning_minutes integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  a        public.reservations%rowtype;
  r        public.reservations%rowtype;
  v_clean  integer;
  v_req    timestamptz;
  v_dur    interval;
  ids      uuid[] := '{}';
  starts   timestamptz[] := '{}';
  ends     timestamptz[] := '{}';
  i        integer;
begin
  select * into a from public.reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reserva no encontrada';
  end if;
  if not public.is_tenant_member(a.tenant_id) then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;
  v_clean := greatest(15, coalesce(p_cleaning_minutes, 15));
  v_req := a.end_at + make_interval(mins => v_clean);
  for r in
    select * from public.reservations
    where room_id = a.room_id and id <> a.id and start_at >= a.start_at
      and status in ('confirmed', 'in_progress', 'completed', 'pending')
    order by start_at
  loop
    exit when r.start_at >= v_req;
    v_dur := r.end_at - r.start_at;
    ids := array_append(ids, r.id);
    starts := array_append(starts, v_req);
    ends := array_append(ends, v_req + v_dur);
    v_req := v_req + v_dur + make_interval(mins => r.cleaning_minutes);
  end loop;
  -- Apply from the last one backwards so no transient overlap trips the trigger.
  if array_length(ids, 1) is not null then
    for i in reverse array_length(ids, 1) .. 1 loop
      update public.reservations set start_at = starts[i], end_at = ends[i] where id = ids[i];
    end loop;
  end if;
  update public.reservations set cleaning_minutes = v_clean where id = a.id;
  return coalesce(array_length(ids, 1), 0);
end;
$$;

create or replace function public.archive_expired_promo_codes()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.promo_codes
     set archived = true, active = false
   where not archived and valid_until is not null and valid_until < now()
     and (auth.uid() is null or public.is_tenant_member(tenant_id));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Server-side only (Edge Functions / cron).
create or replace function public.find_or_create_customer(
  p_tenant uuid, p_name text, p_email text, p_phone text default null, p_no_contact boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_email is not null and btrim(p_email) <> '' then
    select id into v_id from public.customers
     where tenant_id = p_tenant and lower(email) = lower(btrim(p_email))
     order by created_at limit 1;
  end if;
  if v_id is not null then
    return v_id; -- existing guest data is never overwritten from a public booking
  end if;
  insert into public.customers (tenant_id, name, email, phone, no_contact)
  values (p_tenant, nullif(btrim(p_name), ''), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''), coalesce(p_no_contact, false))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.redeem_promo_code(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.promo_codes
     set times_used = times_used + 1,
         active = case when single_use or (max_uses is not null and times_used + 1 >= max_uses) then false else active end,
         archived = case when single_use or (max_uses is not null and times_used + 1 >= max_uses) then true else archived end
   where id = p_id;
end;
$$;

create or replace function public.cancel_stale_pending_reservations()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.reservations
     set status = 'rejected',
         cancellation_reason = 'Cancelación automática: pago no recibido en 60 min'
   where status = 'pending' and not deposit_paid
     and (
       (not is_prebooking and created_at < now() - interval '60 minutes')
       or (is_prebooking and hold_expires_at < now())
     );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Explicit EXECUTE grants (everything else stays private).
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.room_busy_windows(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.validate_promo_code(uuid, text) to anon, authenticated;
grant execute on function public.extend_cleaning_and_shift(uuid, integer) to authenticated;
grant execute on function public.archive_expired_promo_codes() to authenticated;
-- Used inside RLS policies and column defaults, so the client roles need them.
grant execute on function public.is_tenant_member(uuid) to anon, authenticated;
grant execute on function public.has_tenant_role(uuid, public.staff_role) to anon, authenticated;
grant execute on function public.is_member_user(uuid, uuid) to anon, authenticated;
grant execute on function public.current_tenant_id() to anon, authenticated;
-- Trigger functions run with the table owner's rights; no client grant needed.

-- ── Realtime (new reservations in the panel) ─────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.reservations;
  end if;
end $$;

-- ── Scheduled jobs ───────────────────────────────────────────────────────────
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('cancel-stale-pending', '*/15 * * * *',
    $cron$ select public.cancel_stale_pending_reservations(); $cron$);
  perform cron.schedule('archive-expired-promo-codes', '5 3 * * *',
    $cron$ select public.archive_expired_promo_codes(); $cron$);
exception when others then
  raise notice 'pg_cron not available: jobs not scheduled';
end $$;
