-- ─────────────────────────────────────────────────────────────────────────────
-- Invoices with VERI*FACTU (RD 1007/2023, Orden HAC/1177/2024).
-- Each hotel is one "facturación" of the SaaS invoicing system (SIF): its own
-- installation number and its own chain of billing records. Issuing, replacing,
-- rectifying or cancelling an invoice creates, in the same transaction:
-- - the invoice (tax_invoices), which can no longer change;
-- - its billing record (verifactu_records), chained to the previous one by its
--   SHA-256 fingerprint, also unchangeable except for the AEAT's answer.
-- The verifactu-dispatch Edge Function sends the records to the AEAT right
-- away, honouring its flow control (TiempoEsperaEnvio), with the hotel's
-- certificate (Vault, verifactu/<tenant>). Only the VERI*FACTU mode is
-- supported (no "NO VERI*FACTU": no event log or XAdES signature).
-- Rules mirrored in TS: @domain/invoicing.ts (VAT, breakdown) and
-- _shared/verifactu/hash.ts (fingerprint); parity tests in rls.test.ts.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Configuration ────────────────────────────────────────────────────────────
create table public.fiscal_settings (
  tenant_id            uuid primary key references public.tenants(id) on delete cascade,
  enabled              boolean not null default false,
  -- simulated: answers like the AEAT without leaving the server (demo);
  -- pre: AEAT test portal; prod: real submission.
  environment          text not null default 'simulated' check (environment in ('simulated', 'pre', 'prod')),
  issuer_nif           text check (issuer_nif ~ '^[0-9A-Z]{9}$'),
  issuer_name          text check (char_length(issuer_name) between 1 and 120),
  issuer_address       text check (char_length(issuer_address) <= 200),
  -- Identifies this hotel's invoicing within the SIF; set once, never reused.
  installation_number  text unique,
  simplified_limit     numeric(10,2) not null default 400 check (simplified_limit between 0 and 3000),
  has_certificate      boolean not null default false,
  -- Flow control: seconds the AEAT asked to wait, and when the next send may go.
  wait_seconds         integer not null default 60 check (wait_seconds between 0 and 3600),
  next_send_at         timestamptz,
  activated_at         timestamptz,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users(id) on delete set null
);
alter table public.fiscal_settings enable row level security;
create policy fiscal_settings_staff_read on public.fiscal_settings
  for select to authenticated using (public.is_tenant_member(tenant_id));

create table public.invoice_series (
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  series       text not null,
  next_number  integer not null default 1,
  primary key (tenant_id, series)
);
alter table public.invoice_series enable row level security;

-- ── Invoices ─────────────────────────────────────────────────────────────────
create table public.tax_invoices (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  reservation_id  uuid,
  type            text not null check (type in ('F1', 'F2', 'F3', 'R1', 'R5')),
  number          text not null check (char_length(number) between 1 and 60),
  issue_date      date not null,
  issuer_nif      text not null,
  issuer_name     text not null,
  issuer_address  text,
  -- F1/F3/R1: { name, nif } or { name, country, id_type, id_number }, + address.
  recipient       jsonb,
  description     text not null check (char_length(description) between 1 and 500),
  lines           jsonb not null,
  breakdown       jsonb not null,
  base            numeric(12,2) not null,
  tax             numeric(12,2) not null,
  total           numeric(12,2) not null,
  -- R1/R5: the invoice it rectifies. F3: the simplified ones it replaces.
  corrects_id     uuid references public.tax_invoices(id),
  replaces_ids    uuid[],
  reason          text check (char_length(reason) <= 500),
  status          text not null default 'issued' check (status in ('issued', 'replaced', 'cancelled')),
  cancel_reason   text check (char_length(cancel_reason) <= 500),
  qr_url          text not null,
  environment     text not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  unique (tenant_id, number),
  unique (tenant_id, id),
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id)
);
create index tax_invoices_reservation_idx on public.tax_invoices (reservation_id);
create index tax_invoices_tenant_date_idx on public.tax_invoices (tenant_id, issue_date desc);
-- One live invoice (F1/F2/F3) per stay; rectifications go on top.
create unique index tax_invoices_one_per_stay on public.tax_invoices (reservation_id)
  where status = 'issued' and type in ('F1', 'F2', 'F3');
alter table public.tax_invoices enable row level security;
create policy tax_invoices_staff_read on public.tax_invoices
  for select to authenticated using (public.is_tenant_member(tenant_id));
create trigger tax_invoices_no_group_operations before insert or update or delete on public.tax_invoices
  for each row execute function public.forbid_group_operations();

-- An issued invoice does not change: only its status (replaced, cancelled) and,
-- while its record was refused by the AEAT, the recipient.
create or replace function public.guard_tax_invoice()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    -- Only test data of the simulated environment, through purge_simulated_invoices().
    if old.environment = 'simulated' and current_setting('app.verifactu_purge', true) = 'on' then
      return old;
    end if;
    raise exception 'Una factura emitida no se puede borrar: anúlala o rectifícala' using errcode = 'insufficient_privilege';
  end if;
  if (new.type, new.number, new.issue_date, new.issuer_nif, new.lines, new.base, new.tax, new.total,
      new.corrects_id, new.replaces_ids, new.tenant_id, new.reservation_id, new.qr_url)
     is distinct from
     (old.type, old.number, old.issue_date, old.issuer_nif, old.lines, old.base, old.tax, old.total,
      old.corrects_id, old.replaces_ids, old.tenant_id, old.reservation_id, old.qr_url) then
    raise exception 'Una factura emitida no se puede modificar' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger tax_invoices_guard before update or delete on public.tax_invoices
  for each row execute function public.guard_tax_invoice();

-- ── Billing records (the chain) ──────────────────────────────────────────────
create table public.verifactu_records (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  invoice_id           uuid not null,
  seq                  bigint not null,
  kind                 text not null check (kind in ('alta', 'anulacion')),
  subsanacion          boolean not null default false,
  rechazo_previo       text check (rechazo_previo in ('X')),
  sin_registro_previo  boolean not null default false,
  -- Exactly the texts that went into the fingerprint and go into the XML.
  issuer_nif           text not null,
  invoice_number       text not null,
  issue_date           text not null, -- dd-mm-yyyy
  invoice_type         text,
  cuota_total          text,
  importe_total        text,
  prev_hash            text,
  prev_issuer_nif      text,
  prev_number          text,
  prev_issue_date      text,
  generated_at         text not null, -- FechaHoraHusoGenRegistro
  hash                 text not null check (hash ~ '^[0-9A-F]{64}$'),
  environment          text not null,
  -- AEAT's answer.
  status               text not null default 'pending' check (status in (
                         'pending', 'accepted', 'accepted_with_errors', 'rejected')),
  error_code           text,
  error                text,
  csv                  text,
  attempts             integer not null default 0,
  last_attempt_at      timestamptz,
  sent_at              timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id) on delete set null,
  unique (tenant_id, seq),
  foreign key (tenant_id, invoice_id) references public.tax_invoices (tenant_id, id)
);
create index verifactu_records_pending_idx on public.verifactu_records (tenant_id, seq) where status = 'pending';
create index verifactu_records_invoice_idx on public.verifactu_records (invoice_id);
alter table public.verifactu_records enable row level security;
create policy verifactu_records_staff_read on public.verifactu_records
  for select to authenticated using (public.is_tenant_member(tenant_id));

-- A record never changes after it is generated; only the AEAT's answer does.
create or replace function public.guard_verifactu_record()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.environment = 'simulated' and current_setting('app.verifactu_purge', true) = 'on' then
      return old;
    end if;
    raise exception 'Un registro de facturación no se puede borrar' using errcode = 'insufficient_privilege';
  end if;
  if (new.tenant_id, new.invoice_id, new.seq, new.kind, new.subsanacion, new.rechazo_previo,
      new.sin_registro_previo, new.issuer_nif, new.invoice_number, new.issue_date, new.invoice_type,
      new.cuota_total, new.importe_total, new.prev_hash, new.prev_number, new.generated_at, new.hash)
     is distinct from
     (old.tenant_id, old.invoice_id, old.seq, old.kind, old.subsanacion, old.rechazo_previo,
      old.sin_registro_previo, old.issuer_nif, old.invoice_number, old.issue_date, old.invoice_type,
      old.cuota_total, old.importe_total, old.prev_hash, old.prev_number, old.generated_at, old.hash) then
    raise exception 'Un registro de facturación no se puede modificar' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger verifactu_records_guard before update or delete on public.verifactu_records
  for each row execute function public.guard_verifactu_record();

-- ── Shared rules (mirrors of the TS code) ────────────────────────────────────

-- VAT of a kind of line for a hotel (@domain/invoicing.ts: DEFAULT_VAT, vatRate).
create or replace function public.invoice_vat_rate(p_tenant uuid, p_kind text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when jsonb_typeof(settings->'fiscal'->'vat_rates'->p_kind) = 'number'
                  and (settings->'fiscal'->'vat_rates'->>p_kind)::numeric between 0 and 100
                 then (settings->'fiscal'->'vat_rates'->>p_kind)::numeric end
       from public.tenants where id = p_tenant),
    case when p_kind in ('accommodation', 'breakfast', 'food', 'catering', 'minibar') then 10 else 21 end);
$$;

-- VAT split per rate of some lines [{qty, unit_price, vat_rate}] (taxBreakdown).
create or replace function public.invoice_breakdown(p_lines jsonb)
returns jsonb language sql immutable set search_path = public as $$
  with g as (
    select (l->>'vat_rate')::numeric as rate,
           sum(round((l->>'qty')::numeric * (l->>'unit_price')::numeric, 2)) as gross
      from jsonb_array_elements(p_lines) l
     group by 1
  ), r as (
    select rate, round(gross / (1 + rate / 100), 2) as base, gross from g
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object('rate', rate, 'base', base, 'tax', gross - base) order by rate), '[]'::jsonb),
    'base', coalesce(sum(base), 0),
    'tax', coalesce(sum(gross - base), 0),
    'total', coalesce(sum(gross), 0))
  from r;
$$;

-- AEAT fingerprint (_shared/verifactu/hash.ts): SHA-256 of "field=value&…".
create or replace function public.verifactu_hash(p_fields text[], p_values text[])
returns text language sql immutable set search_path = public, extensions as $$
  select upper(encode(extensions.digest(convert_to(
    (select string_agg(f || '=' || coalesce(btrim(v), ''), '&' order by i)
       from unnest(p_fields, p_values) with ordinality as t(f, v, i)), 'UTF8'), 'sha256'), 'hex'));
$$;

-- "2026-09-27T19:20:30+02:00": now, in the hotel's timezone, with its offset.
create or replace function public.verifactu_now(p_tz text)
returns text language plpgsql stable set search_path = public as $$
declare v_local timestamp := now() at time zone p_tz;
        v_off interval := (now() at time zone p_tz) - (now() at time zone 'UTC');
begin
  return to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS')
    || case when v_off < interval '0' then '-' else '+' end
    || lpad(abs(extract(hour from v_off))::int::text, 2, '0') || ':'
    || lpad(abs(extract(minute from v_off))::int::text, 2, '0');
end;
$$;

create or replace function public.aeat_amount(n numeric)
returns text language sql immutable as $$ select to_char(round(n, 2), 'FM999999999990.00') $$;

-- ── Internal: numbering and the chain ────────────────────────────────────────

-- Next number of a series (the settings row is already locked by the caller).
create or replace function public.next_invoice_number(p_tenant uuid, p_prefix text, p_year integer)
returns text language plpgsql security definer set search_path = public as $$
declare v_series text := p_prefix || p_year::text; v_n integer;
begin
  insert into public.invoice_series (tenant_id, series) values (p_tenant, v_series)
  on conflict (tenant_id, series) do nothing;
  update public.invoice_series set next_number = next_number + 1
   where tenant_id = p_tenant and series = v_series
   returning next_number - 1 into v_n;
  return v_series || '-' || lpad(v_n::text, 6, '0');
end;
$$;

-- Appends a record to the hotel's chain: previous record, fingerprint, time.
create or replace function public.append_verifactu_record(
  p_invoice public.tax_invoices, p_kind text,
  p_subsanacion boolean default false, p_rechazo_previo text default null,
  p_sin_registro_previo boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.fiscal_settings%rowtype;
  prev public.verifactu_records%rowtype;
  v_tz text;
  v_now text;
  v_date text := to_char(p_invoice.issue_date, 'DD-MM-YYYY');
  v_hash text;
  v_id uuid;
  v_seq bigint;
begin
  select * into s from public.fiscal_settings where tenant_id = p_invoice.tenant_id for update;
  select coalesce(settings->>'timezone', 'Europe/Madrid') into v_tz from public.tenants where id = p_invoice.tenant_id;
  -- Each environment has its own chain: test records never precede real ones.
  select * into prev from public.verifactu_records
   where tenant_id = p_invoice.tenant_id and environment = p_invoice.environment
   order by seq desc limit 1;
  select coalesce(max(seq), 0) + 1 into v_seq from public.verifactu_records where tenant_id = p_invoice.tenant_id;
  v_now := public.verifactu_now(v_tz);
  if p_kind = 'alta' then
    v_hash := public.verifactu_hash(
      array['IDEmisorFactura', 'NumSerieFactura', 'FechaExpedicionFactura', 'TipoFactura',
            'CuotaTotal', 'ImporteTotal', 'Huella', 'FechaHoraHusoGenRegistro'],
      array[p_invoice.issuer_nif, p_invoice.number, v_date, p_invoice.type,
            public.aeat_amount(p_invoice.tax), public.aeat_amount(p_invoice.total), prev.hash, v_now]);
  else
    v_hash := public.verifactu_hash(
      array['IDEmisorFacturaAnulada', 'NumSerieFacturaAnulada', 'FechaExpedicionFacturaAnulada',
            'Huella', 'FechaHoraHusoGenRegistro'],
      array[p_invoice.issuer_nif, p_invoice.number, v_date, prev.hash, v_now]);
  end if;
  insert into public.verifactu_records (
    tenant_id, invoice_id, seq, kind, subsanacion, rechazo_previo, sin_registro_previo,
    issuer_nif, invoice_number, issue_date, invoice_type, cuota_total, importe_total,
    prev_hash, prev_issuer_nif, prev_number, prev_issue_date, generated_at, hash, environment, created_by)
  values (
    p_invoice.tenant_id, p_invoice.id, v_seq, p_kind, p_subsanacion, p_rechazo_previo,
    p_sin_registro_previo, p_invoice.issuer_nif, p_invoice.number, v_date,
    case when p_kind = 'alta' then p_invoice.type end,
    case when p_kind = 'alta' then public.aeat_amount(p_invoice.tax) end,
    case when p_kind = 'alta' then public.aeat_amount(p_invoice.total) end,
    prev.hash, prev.issuer_nif, prev.invoice_number, prev.issue_date, v_now, v_hash, p_invoice.environment, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- The URL of the tax QR (@domain/verifactu.ts: qrUrl). Invoice numbers are
-- letters, digits and "-" and NIFs alphanumeric, so nothing needs URL-encoding.
create or replace function public.verifactu_qr_url(p_env text, p_nif text, p_number text, p_date date, p_total numeric)
returns text language sql immutable set search_path = public as $$
  select case when p_env = 'prod' then 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
              else 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR' end
    || '?nif=' || p_nif || '&numserie=' || p_number
    || '&fecha=' || to_char(p_date, 'DD-MM-YYYY') || '&importe=' || public.aeat_amount(p_total);
$$;

-- Checks the settings and the caller before creating an invoice.
create or replace function public.fiscal_ready(p_tenant uuid)
returns public.fiscal_settings language plpgsql security definer set search_path = public as $$
declare s public.fiscal_settings%rowtype;
begin
  if not public.is_tenant_staff(p_tenant) then
    raise exception 'Sin permiso para facturar en este hotel' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.fiscal_settings where tenant_id = p_tenant for update;
  if s.tenant_id is null or not s.enabled then
    raise exception 'La facturación VERI*FACTU no está activada en este hotel' using errcode = 'check_violation';
  end if;
  if s.issuer_nif is null or s.issuer_name is null then
    raise exception 'Faltan el NIF y la razón social del hotel en la configuración fiscal' using errcode = 'check_violation';
  end if;
  return s;
end;
$$;

-- Light server check of a recipient (the panel validates the NIF letter too).
create or replace function public.check_invoice_recipient(p jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare v_name text := btrim(p->>'name'); v_nif text := upper(regexp_replace(coalesce(p->>'nif', ''), '[\s-]', '', 'g'));
begin
  if coalesce(v_name, '') = '' or char_length(v_name) > 120 then
    raise exception 'Falta el nombre o la razón social del cliente' using errcode = 'check_violation';
  end if;
  if v_nif <> '' then
    if v_nif !~ '^[0-9A-Z]{9}$' then
      raise exception 'El NIF del cliente no tiene un formato válido' using errcode = 'check_violation';
    end if;
    return jsonb_build_object('name', v_name, 'nif', v_nif, 'address', nullif(btrim(p->>'address'), ''));
  end if;
  if coalesce(p->>'country', '') !~ '^[A-Z]{2}$' or p->>'country' = 'ES'
     or coalesce(p->>'id_type', '') not in ('02', '03', '04', '05', '06', '07')
     or coalesce(btrim(p->>'id_number'), '') = '' or char_length(btrim(p->>'id_number')) > 20 then
    raise exception 'Falta el NIF o, para clientes extranjeros, país, tipo y número de documento' using errcode = 'check_violation';
  end if;
  return jsonb_build_object('name', v_name, 'country', p->>'country', 'id_type', p->>'id_type',
                            'id_number', btrim(p->>'id_number'), 'address', nullif(btrim(p->>'address'), ''));
end;
$$;

-- Lines of a stay: accommodation, extras of the booking and posted charges.
create or replace function public.invoice_lines_for(p_reservation uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; v_lines jsonb := '[]'::jsonb; v_extras numeric := 0; v_tz text; v_nights int;
begin
  select res.*, rm.name as room_name, coalesce(t.settings->>'timezone', 'Europe/Madrid') as tz
    into r
    from public.reservations res
    join public.rooms rm on rm.id = res.room_id
    join public.tenants t on t.id = res.tenant_id
   where res.id = p_reservation;
  v_tz := r.tz;
  v_nights := greatest(1, ((r.end_at at time zone v_tz)::date - (r.start_at at time zone v_tz)::date));

  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', e.category::text, 'description', e.name, 'qty', x.qty, 'unit_price', x.unit_price,
           'vat_rate', public.invoice_vat_rate(r.tenant_id, e.category::text)) order by x.created_at), '[]'::jsonb),
         coalesce(sum(x.qty * x.unit_price), 0)
    into v_lines, v_extras
    from public.reservation_extras x join public.extras e on e.id = x.extra_id
   where x.reservation_id = r.id and not x.is_gift;

  v_lines := jsonb_build_array(jsonb_build_object(
      'kind', 'accommodation',
      'description', 'Alojamiento · ' || r.room_name || ' · ' || v_nights || case when v_nights = 1 then ' noche (' else ' noches (' end
                     || to_char((r.start_at at time zone v_tz)::date, 'DD/MM') || '–'
                     || to_char((r.end_at at time zone v_tz)::date, 'DD/MM/YYYY') || ')',
      'qty', 1,
      'unit_price', round(r.total - v_extras, 2),
      'vat_rate', public.invoice_vat_rate(r.tenant_id, 'accommodation')))
    || v_lines
    || coalesce((select jsonb_agg(jsonb_build_object(
           'kind', c.category, 'description', c.description, 'qty', c.qty, 'unit_price', c.unit_price,
           'vat_rate', public.invoice_vat_rate(r.tenant_id, c.category)) order by c.created_at)
         from public.folio_charges c where c.reservation_id = r.id and c.status = 'posted'), '[]'::jsonb);
  return v_lines;
end;
$$;

-- Inserts an invoice with its lines and totals, and its "alta" record.
create or replace function public.create_tax_invoice(
  s public.fiscal_settings, p_reservation uuid, p_type text, p_recipient jsonb,
  p_description text, p_lines jsonb, p_corrects uuid default null, p_replaces uuid[] default null,
  p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tz text;
  v_today date;
  -- Invoices outside production go in their own series ("PF2026-…"), so tests
  -- never take numbers of the real ones.
  v_prefix text := case when s.environment = 'prod' then '' else 'P' end
                   || case p_type when 'F2' then 'S' when 'R1' then 'R' when 'R5' then 'RS' else 'F' end;
  b jsonb := public.invoice_breakdown(p_lines);
  v_number text;
  inv public.tax_invoices%rowtype;
begin
  select coalesce(settings->>'timezone', 'Europe/Madrid') into v_tz from public.tenants where id = s.tenant_id;
  v_today := (now() at time zone v_tz)::date;
  v_number := public.next_invoice_number(s.tenant_id, v_prefix, extract(year from v_today)::int);
  insert into public.tax_invoices (
    tenant_id, reservation_id, type, number, issue_date, issuer_nif, issuer_name, issuer_address,
    recipient, description, lines, breakdown, base, tax, total, corrects_id, replaces_ids, reason,
    qr_url, environment, created_by)
  values (
    s.tenant_id, p_reservation, p_type, v_number, v_today, s.issuer_nif, s.issuer_name, s.issuer_address,
    p_recipient, left(p_description, 500), p_lines, b->'rows', (b->>'base')::numeric, (b->>'tax')::numeric,
    (b->>'total')::numeric, p_corrects, p_replaces, p_reason,
    public.verifactu_qr_url(s.environment, s.issuer_nif, v_number, v_today, (b->>'total')::numeric),
    s.environment, auth.uid())
  returning * into inv;
  perform public.append_verifactu_record(inv, 'alta');
  return inv.id;
end;
$$;

-- ── Functions for the panel ──────────────────────────────────────────────────

-- The invoice of a stay: simplified without recipient, full with one.
create or replace function public.issue_invoice(p_reservation uuid, p_recipient jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.reservations%rowtype;
  s public.fiscal_settings%rowtype;
  v_lines jsonb;
  v_total numeric;
  v_recipient jsonb;
begin
  select * into r from public.reservations where id = p_reservation;
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  s := public.fiscal_ready(r.tenant_id);
  if r.status::text not in ('confirmed', 'in_progress', 'completed') then
    raise exception 'Solo se factura una estancia confirmada, en curso o terminada' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.tax_invoices where reservation_id = r.id and status = 'issued'
               and type in ('F1', 'F2', 'F3')) then
    raise exception 'Esta estancia ya tiene factura: rectifícala o anúlala' using errcode = 'unique_violation';
  end if;
  if exists (select 1 from public.folio_charges where reservation_id = r.id and status = 'requested') then
    raise exception 'Hay cargos pedidos por el huésped sin confirmar en la cuenta' using errcode = 'check_violation';
  end if;
  v_lines := public.invoice_lines_for(r.id);
  v_total := (public.invoice_breakdown(v_lines)->>'total')::numeric;
  if v_total <= 0 then
    raise exception 'No hay importe que facturar' using errcode = 'check_violation';
  end if;
  if p_recipient is null then
    if v_total > s.simplified_limit then
      raise exception 'Con % € hace falta factura completa: añade los datos del cliente (límite de la simplificada: % €)',
        v_total, s.simplified_limit using errcode = 'check_violation';
    end if;
  else
    v_recipient := public.check_invoice_recipient(p_recipient);
  end if;
  return public.create_tax_invoice(
    s, r.id, case when v_recipient is null then 'F2' else 'F1' end, v_recipient,
    'Estancia ' || r.reference, v_lines);
end;
$$;

-- A guest who got a simplified invoice asks for a full one (F3, "canje").
create or replace function public.exchange_simplified_invoice(p_invoice uuid, p_recipient jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare i public.tax_invoices%rowtype; s public.fiscal_settings%rowtype; v_id uuid;
begin
  select * into i from public.tax_invoices where id = p_invoice for update;
  if i.id is null then
    raise exception 'Factura no encontrada' using errcode = 'no_data_found';
  end if;
  s := public.fiscal_ready(i.tenant_id);
  if i.type <> 'F2' or i.status <> 'issued' then
    raise exception 'Solo se canjea una factura simplificada vigente' using errcode = 'check_violation';
  end if;
  update public.tax_invoices set status = 'replaced' where id = i.id;
  v_id := public.create_tax_invoice(
    s, i.reservation_id, 'F3', public.check_invoice_recipient(p_recipient),
    i.description || ' (sustituye a ' || i.number || ')', i.lines, null, array[i.id]);
  return v_id;
end;
$$;

-- Corrects an invoice by differences (R1 for full ones, R5 for simplified):
-- the lines are the amounts to add or, negative, to take off.
create or replace function public.rectify_invoice(p_invoice uuid, p_lines jsonb, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare i public.tax_invoices%rowtype; s public.fiscal_settings%rowtype; v_lines jsonb;
begin
  select * into i from public.tax_invoices where id = p_invoice;
  if i.id is null then
    raise exception 'Factura no encontrada' using errcode = 'no_data_found';
  end if;
  s := public.fiscal_ready(i.tenant_id);
  if i.status <> 'issued' or i.type not in ('F1', 'F2', 'F3') then
    raise exception 'Solo se rectifica una factura vigente' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Indica el motivo de la rectificación' using errcode = 'check_violation';
  end if;
  select jsonb_agg(jsonb_build_object(
           'kind', coalesce(l->>'kind', 'other'), 'description', left(btrim(l->>'description'), 200),
           'qty', (l->>'qty')::numeric, 'unit_price', (l->>'unit_price')::numeric,
           'vat_rate', coalesce((l->>'vat_rate')::numeric, public.invoice_vat_rate(i.tenant_id, coalesce(l->>'kind', 'other')))))
    into v_lines
    from jsonb_array_elements(p_lines) l
   where coalesce(btrim(l->>'description'), '') <> '' and (l->>'qty')::numeric <> 0;
  if v_lines is null or (public.invoice_breakdown(v_lines)->>'total')::numeric = 0 then
    raise exception 'La rectificación no tiene importe' using errcode = 'check_violation';
  end if;
  return public.create_tax_invoice(
    s, i.reservation_id, case when i.type = 'F2' then 'R5' else 'R1' end, i.recipient,
    'Rectificación de ' || i.number || ': ' || btrim(p_reason), v_lines, i.id, null, btrim(p_reason));
end;
$$;

-- Cancels an invoice issued by mistake (no real sale): an "anulación" record.
-- Only management; a real correction is a rectifying invoice.
create or replace function public.cancel_invoice(p_invoice uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare i public.tax_invoices%rowtype; last public.verifactu_records%rowtype;
begin
  select * into i from public.tax_invoices where id = p_invoice for update;
  if i.id is null or not public.has_tenant_role(i.tenant_id, 'admin') then
    raise exception 'Solo dirección puede anular facturas' using errcode = 'insufficient_privilege';
  end if;
  perform public.fiscal_ready(i.tenant_id);
  if i.status <> 'issued' then
    raise exception 'La factura ya no está vigente' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Indica el motivo de la anulación' using errcode = 'check_violation';
  end if;
  select * into last from public.verifactu_records where invoice_id = i.id and kind = 'alta' order by seq desc limit 1;
  update public.tax_invoices set status = 'cancelled', cancel_reason = btrim(p_reason) where id = i.id;
  -- If the AEAT never registered it, the cancellation says so.
  perform public.append_verifactu_record(i, 'anulacion', false, null, coalesce(last.status = 'rejected', false));
  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id, payload)
  values (i.tenant_id, auth.uid(), 'invoice.cancelled', 'tax_invoices', i.id, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

-- Sends an invoice again after the AEAT refused its record or accepted it with
-- errors ("subsanación"), optionally with the recipient corrected.
create or replace function public.resubmit_invoice(p_invoice uuid, p_recipient jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare i public.tax_invoices%rowtype; last public.verifactu_records%rowtype;
begin
  select * into i from public.tax_invoices where id = p_invoice for update;
  if i.id is null then
    raise exception 'Factura no encontrada' using errcode = 'no_data_found';
  end if;
  perform public.fiscal_ready(i.tenant_id);
  select * into last from public.verifactu_records where invoice_id = i.id order by seq desc limit 1;
  if i.status <> 'issued' or last.kind <> 'alta' or last.status not in ('rejected', 'accepted_with_errors') then
    raise exception 'Solo se reenvía una factura rechazada o aceptada con errores' using errcode = 'check_violation';
  end if;
  if p_recipient is not null then
    if i.type = 'F2' or i.type = 'R5' then
      raise exception 'Una factura simplificada no lleva cliente: canjéala por una completa' using errcode = 'check_violation';
    end if;
    update public.tax_invoices set recipient = public.check_invoice_recipient(p_recipient) where id = i.id
    returning * into i;
  end if;
  return public.append_verifactu_record(i, 'alta', true, case when last.status = 'rejected' then 'X' end);
end;
$$;

-- Management sets the hotel's fiscal data. Once VERI*FACTU is on in production
-- it stays on (no switching the system on and off at will).
create or replace function public.save_fiscal_settings(p_tenant uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s public.fiscal_settings%rowtype; v_has_records boolean; v_enabled boolean; v_env text; v_nif text;
begin
  if not public.has_tenant_role(p_tenant, 'admin') then
    raise exception 'Solo dirección puede cambiar la configuración fiscal' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.fiscal_settings where tenant_id = p_tenant for update;
  v_has_records := exists (select 1 from public.verifactu_records where tenant_id = p_tenant);
  v_enabled := coalesce((p_data->>'enabled')::boolean, s.enabled, false);
  v_env := coalesce(p_data->>'environment', s.environment, 'simulated');
  v_nif := coalesce(nullif(upper(regexp_replace(p_data->>'issuer_nif', '[\s-]', '', 'g')), ''), s.issuer_nif);
  if s.enabled and s.environment = 'prod' and (not v_enabled or v_env <> 'prod') then
    raise exception 'VERI*FACTU en producción no se desactiva desde el panel: contacta con soporte' using errcode = 'check_violation';
  end if;
  if v_has_records and v_nif is distinct from s.issuer_nif then
    raise exception 'El NIF del emisor no se cambia cuando ya hay facturas' using errcode = 'check_violation';
  end if;
  if v_has_records and v_env <> s.environment and s.environment <> 'simulated' then
    raise exception 'El entorno no se cambia cuando ya hay facturas enviadas a la AEAT' using errcode = 'check_violation';
  end if;
  insert into public.fiscal_settings as f (tenant_id, enabled, environment, issuer_nif, issuer_name, issuer_address,
                                           simplified_limit, installation_number, activated_at, updated_by)
  values (p_tenant, v_enabled, v_env, v_nif,
          nullif(btrim(p_data->>'issuer_name'), ''), nullif(btrim(p_data->>'issuer_address'), ''),
          coalesce((p_data->>'simplified_limit')::numeric, 400),
          case when v_enabled then to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS') || '-' || left(p_tenant::text, 8) end,
          case when v_enabled then now() end, auth.uid())
  on conflict (tenant_id) do update set
    enabled = v_enabled,
    environment = v_env,
    issuer_nif = v_nif,
    issuer_name = coalesce(nullif(btrim(p_data->>'issuer_name'), ''), f.issuer_name),
    issuer_address = case when p_data ? 'issuer_address' then nullif(btrim(p_data->>'issuer_address'), '') else f.issuer_address end,
    simplified_limit = coalesce((p_data->>'simplified_limit')::numeric, f.simplified_limit),
    installation_number = coalesce(f.installation_number,
      case when v_enabled then to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS') || '-' || left(p_tenant::text, 8) end),
    activated_at = coalesce(f.activated_at, case when v_enabled then now() end),
    updated_at = now(),
    updated_by = auth.uid();
  if p_data ? 'vat_rates' then
    update public.tenants
       set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{fiscal}',
                                coalesce(settings->'fiscal', '{}'::jsonb) || jsonb_build_object('vat_rates', p_data->'vat_rates'))
     where id = p_tenant;
  end if;
end;
$$;

-- The hotel's qualified certificate (PEM) for the AEAT's mutual TLS.
create or replace function public.save_verifactu_certificate(p_tenant uuid, p_cert text, p_key text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid; v_name text := 'verifactu/' || p_tenant::text; v_secret text;
begin
  if not public.has_tenant_role(p_tenant, 'admin') then
    raise exception 'Solo dirección puede guardar el certificado' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_cert, '') !~ '-----BEGIN CERTIFICATE-----' or coalesce(p_key, '') !~ '-----BEGIN [A-Z ]*PRIVATE KEY-----' then
    raise exception 'El certificado y la clave deben ir en formato PEM' using errcode = 'check_violation';
  end if;
  v_secret := jsonb_build_object('cert', p_cert, 'key', p_key)::text;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(v_secret, v_name, 'VERI*FACTU client certificate');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
  insert into public.fiscal_settings (tenant_id, has_certificate, updated_by) values (p_tenant, true, auth.uid())
  on conflict (tenant_id) do update set has_certificate = true, updated_at = now(), updated_by = auth.uid();
  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id)
  values (p_tenant, auth.uid(), 'verifactu.certificate_saved', 'fiscal_settings', p_tenant);
end;
$$;

create or replace function public.verifactu_certificate(p_tenant uuid)
returns jsonb language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'verifactu/' || p_tenant::text limit 1;
$$;

-- What the invoice of a stay would be, for the panel (staff of the hotel).
create or replace function public.invoice_preview(p_reservation uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tenant uuid; v_lines jsonb;
begin
  select tenant_id into v_tenant from public.reservations where id = p_reservation;
  if v_tenant is null or not public.is_tenant_member(v_tenant) then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  v_lines := public.invoice_lines_for(p_reservation);
  return jsonb_build_object('lines', v_lines, 'totals', public.invoice_breakdown(v_lines),
    'pending_charges', (select count(*) from public.folio_charges where reservation_id = p_reservation and status = 'requested'));
end;
$$;

-- Invoices of a stay for its guest (booking token or member account).
create or replace function public.get_guest_invoices(p_reservation_id uuid, p_token text default null)
returns setof public.tax_invoices language plpgsql stable security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.guest_stay(p_reservation_id, p_token);
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  return query select * from public.tax_invoices where reservation_id = r.id order by created_at;
end;
$$;

-- Removes the invoices (and records) of a stay in the simulated environment:
-- only for the end-to-end tests of the demo, with the service key. Invoices of
-- the AEAT's test portal or of production can never be deleted.
create or replace function public.purge_simulated_invoices(p_reservation uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if exists (select 1 from public.tax_invoices where reservation_id = p_reservation and environment <> 'simulated') then
    raise exception 'Solo se purgan facturas del entorno simulado' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('app.verifactu_purge', 'on', true);
  delete from public.verifactu_records
   where invoice_id in (select id from public.tax_invoices where reservation_id = p_reservation);
  delete from public.tax_invoices where reservation_id = p_reservation and corrects_id is not null;
  delete from public.tax_invoices where reservation_id = p_reservation;
  get diagnostics v_n = row_count;
  perform set_config('app.verifactu_purge', 'off', true);
  return v_n;
end;
$$;
revoke execute on function public.purge_simulated_invoices(uuid) from public, anon, authenticated;
grant execute on function public.purge_simulated_invoices(uuid) to service_role;

-- ── Grants ───────────────────────────────────────────────────────────────────
revoke execute on function public.next_invoice_number(uuid, text, integer),
  public.append_verifactu_record(public.tax_invoices, text, boolean, text, boolean),
  public.create_tax_invoice(public.fiscal_settings, uuid, text, jsonb, text, jsonb, uuid, uuid[], text),
  public.fiscal_ready(uuid), public.verifactu_certificate(uuid), public.invoice_lines_for(uuid)
  from public, anon, authenticated;
grant execute on function public.verifactu_certificate(uuid) to service_role;
revoke execute on function public.issue_invoice(uuid, jsonb), public.exchange_simplified_invoice(uuid, jsonb),
  public.rectify_invoice(uuid, jsonb, text), public.cancel_invoice(uuid, text), public.resubmit_invoice(uuid, jsonb),
  public.save_fiscal_settings(uuid, jsonb), public.save_verifactu_certificate(uuid, text, text),
  public.invoice_preview(uuid)
  from public, anon;
grant execute on function public.issue_invoice(uuid, jsonb), public.exchange_simplified_invoice(uuid, jsonb),
  public.rectify_invoice(uuid, jsonb, text), public.cancel_invoice(uuid, text), public.resubmit_invoice(uuid, jsonb),
  public.save_fiscal_settings(uuid, jsonb), public.save_verifactu_certificate(uuid, text, text),
  public.invoice_preview(uuid)
  to authenticated;
grant execute on function public.get_guest_invoices(uuid, text) to anon, authenticated;

-- ── Schedule ─────────────────────────────────────────────────────────────────
-- Every minute, if a hotel has records to send and its wait is over, the
-- database calls verifactu-dispatch (URL and key in Vault: verifactu/cron_url,
-- verifactu/cron_key, set by scripts/verifactu-setup.mjs).
create or replace function public.verifactu_tick()
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_url text; v_key text;
begin
  if not exists (
    select 1 from public.verifactu_records v
      join public.fiscal_settings s on s.tenant_id = v.tenant_id and s.enabled
     where v.status = 'pending' and (s.next_send_at is null or s.next_send_at <= now())
  ) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'verifactu/cron_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'verifactu/cron_key';
  if v_url is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
end;
$$;
revoke execute on function public.verifactu_tick() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('verifactu-dispatch', '* * * * *', $cron$ select public.verifactu_tick(); $cron$);
exception when others then
  raise notice 'pg_cron not available: VERI*FACTU dispatch not scheduled (%)', sqlerrm;
end $$;
