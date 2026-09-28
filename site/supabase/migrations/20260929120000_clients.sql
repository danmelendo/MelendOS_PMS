-- ─────────────────────────────────────────────────────────────────────────────
-- Customers of Melend/OS (/admin/ → Clientes, Facturación), in the sales
-- project, never in the product's. Dan, 29/09/2026: "un panel AIO desde el que
-- organizar los clientes, ya que si aumentan los hoteles, las credenciales de
-- las bbdd y accesos pueden ser un lío".
--
--   clients          who pays, what they contracted and for how much
--   client_hotels    their hotels and where each one runs (product tenant)
--   client_links     panel, web, Supabase, hosting, VPS… one click away
--   client_access    WHERE each credential lives and when it expires; never
--                    the secret itself (that stays in Vault, the bank's
--                    back office or the password manager)
--   client_invoices  what we bill them: drafts created on the due date by
--                    generate_client_invoices() (daily cron), issued with a
--                    correlative number, then paid or cancelled
--
-- Only sales admins read or write any of it (RLS); anonymous users nothing.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.clients (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid references public.leads(id) on delete set null,
  name              text not null check (length(btrim(name)) between 1 and 120),
  legal_name        text,
  tax_id            text,
  billing_email     text,
  billing_address   text,
  contact_name      text,
  phone             text,
  status            text not null default 'onboarding'
                      check (status in ('onboarding', 'active', 'paused', 'cancelled')),
  plan              text not null check (plan in ('hostal', 'starter', 'pro', 'group')),
  packages          text[] not null default '{}',
  sla               text check (sla in ('priority', 'urgent', 'always')),
  rooms             integer not null default 1 check (rooms > 0),
  billing_cycle     text not null default 'monthly' check (billing_cycle in ('monthly', 'annual')),
  founder           boolean not null default false,
  -- Agreed price, € per month before VAT (the quote suggests it; it can differ).
  monthly_fee       numeric(10,2) not null default 0 check (monthly_fee >= 0),
  setup_fee         numeric(10,2) not null default 0 check (setup_fee >= 0),
  vat_rate          numeric(4,2) not null default 21 check (vat_rate between 0 and 30),
  start_date        date,
  -- First day of the next period to bill; null = nothing to bill yet.
  next_invoice_date date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.client_hotels (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  name          text not null,
  environment   text not null default 'production' check (environment in ('production', 'demo')),
  -- The hotel in the product: project ref of its Supabase and the tenant slug.
  project_ref   text,
  tenant_slug   text,
  panel_url     text,
  web_url       text,
  custom_domain text,
  notes         text,
  created_at    timestamptz not null default now()
);

create table public.client_links (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  kind       text not null default 'other'
               check (kind in ('panel', 'web', 'supabase', 'hosting', 'vps', 'repo', 'docs', 'other')),
  label      text not null,
  url        text not null check (url ~* '^https?://'),
  created_at timestamptz not null default now()
);

create table public.client_access (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  -- What it opens: "TPV Redsys", "SES.HOSPEDAJES", "Certificado VERI*FACTU"…
  system     text not null,
  -- Where the secret is kept (e.g. "Vault prod: payments/<tenant>",
  -- "gestor de contraseñas › Melend/OS › Hotel X"). Never the secret.
  location   text not null,
  holder     text,
  expires_on date,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_invoices (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete restrict,
  kind         text not null default 'subscription' check (kind in ('subscription', 'setup', 'other')),
  concept      text not null,
  period_start date,
  period_end   date,
  base         numeric(10,2) not null check (base >= 0),
  vat_rate     numeric(4,2) not null default 21,
  total        numeric(10,2) generated always as (round(base * (1 + vat_rate / 100), 2)) stored,
  status       text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'cancelled')),
  number       text unique,
  issued_on    date,
  due_on       date,
  paid_on      date,
  method       text,
  notes        text,
  created_at   timestamptz not null default now(),
  -- One subscription invoice per client and period: the generator can run twice.
  unique (client_id, kind, period_start)
);
create index client_invoices_status_idx on public.client_invoices (status, due_on);

-- ── Access: sales admins only ───────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['clients', 'client_hotels', 'client_links', 'client_access', 'client_invoices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy "sales admins" on public.%I for all to authenticated
                      using (public.is_sales_admin()) with check (public.is_sales_admin())', t);
  end loop;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
create trigger client_access_touch before update on public.client_access
  for each row execute function public.touch_updated_at();

-- ── Invoices ────────────────────────────────────────────────────────────────
-- An issued invoice keeps its amounts, number and client: it can only be
-- marked paid or cancelled (a correction is a new invoice).
create or replace function public.guard_client_invoice()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Solo se borran borradores; una factura emitida se anula' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and (
       new.client_id is distinct from old.client_id or new.base is distinct from old.base
    or new.vat_rate is distinct from old.vat_rate or new.concept is distinct from old.concept
    or new.number is distinct from old.number or new.issued_on is distinct from old.issued_on
    or new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end) then
    raise exception 'Una factura emitida no se modifica' using errcode = 'check_violation';
  end if;
  if old.status in ('paid', 'cancelled') and new.status is distinct from old.status then
    raise exception 'La factura ya está cerrada' using errcode = 'check_violation';
  end if;
  if new.status = 'draft' and old.status <> 'draft' then
    raise exception 'Una factura emitida no vuelve a borrador' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger client_invoices_guard before update or delete on public.client_invoices
  for each row execute function public.guard_client_invoice();

-- Issues a draft: next number of the year (MOS-2026-0001…), today's date and
-- payment due in 15 days. Numbers never repeat or skip.
create or replace function public.issue_client_invoice(p_invoice uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from current_date);
  v_seq int;
  v_number text;
begin
  if not public.is_sales_admin() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtext('client_invoices_number'));
  select coalesce(max(split_part(number, '-', 3)::int), 0) + 1 into v_seq
    from public.client_invoices where number like 'MOS-' || v_year || '-%';
  v_number := format('MOS-%s-%s', v_year, lpad(v_seq::text, 4, '0'));
  update public.client_invoices
     set status = 'issued', number = v_number, issued_on = current_date,
         due_on = coalesce(due_on, current_date + 15)
   where id = p_invoice and status = 'draft';
  if not found then
    raise exception 'La factura no existe o ya está emitida' using errcode = 'no_data_found';
  end if;
  return v_number;
end;
$$;
revoke all on function public.issue_client_invoice(uuid) from public, anon;
grant execute on function public.issue_client_invoice(uuid) to authenticated;

-- The automatic part: for every active client whose next period has started,
-- a draft for that period (a month, or a year when paying annually) and the
-- setup fee once. Moves next_invoice_date forward. Runs daily (cron) and from
-- the panel; running it twice changes nothing.
create or replace function public.generate_client_invoices(p_today date default current_date)
returns integer language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_end date;
  v_count int := 0;
  v_setup int;
begin
  -- The cron job runs without a user; from the API only sales admins.
  if auth.uid() is not null and not public.is_sales_admin() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  for c in
    select * from public.clients
     where status = 'active' and next_invoice_date is not null and next_invoice_date <= p_today
     for update
  loop
    -- Catch up if several periods were missed (e.g. the job was off).
    while c.next_invoice_date <= p_today loop
      v_end := c.next_invoice_date + case c.billing_cycle when 'annual' then interval '1 year' else interval '1 month' end;
      insert into public.client_invoices (client_id, kind, concept, period_start, period_end, base, vat_rate, due_on)
      values (c.id, 'subscription',
              format('Melend/OS · plan %s · %s', c.plan,
                     case c.billing_cycle when 'annual' then 'año ' || to_char(c.next_invoice_date, 'DD/MM/YYYY')
                          else 'mes ' || to_char(c.next_invoice_date, 'MM/YYYY') end),
              c.next_invoice_date, (v_end - interval '1 day')::date,
              c.monthly_fee * case c.billing_cycle when 'annual' then 12 else 1 end,
              c.vat_rate, c.next_invoice_date + 15)
      on conflict (client_id, kind, period_start) do nothing;
      if found then v_count := v_count + 1; end if;
      c.next_invoice_date := v_end::date;
    end loop;
    update public.clients set next_invoice_date = c.next_invoice_date where id = c.id;
  end loop;

  -- Setup fee: once per client, when it becomes active.
  insert into public.client_invoices (client_id, kind, concept, period_start, base, vat_rate, due_on)
  select k.id, 'setup', 'Implantación de Melend/OS', coalesce(k.start_date, p_today), k.setup_fee, k.vat_rate,
         coalesce(k.start_date, p_today) + 15
    from public.clients k
   where k.status = 'active' and k.setup_fee > 0
     and not exists (select 1 from public.client_invoices i where i.client_id = k.id and i.kind = 'setup')
  on conflict do nothing;
  get diagnostics v_setup = row_count;
  return v_count + v_setup;
end;
$$;
revoke all on function public.generate_client_invoices(date) from public, anon;
grant execute on function public.generate_client_invoices(date) to authenticated;

-- Daily at 06:00 UTC.
create extension if not exists pg_cron;
select cron.schedule('generate-client-invoices', '0 6 * * *', $$select public.generate_client_invoices()$$);
