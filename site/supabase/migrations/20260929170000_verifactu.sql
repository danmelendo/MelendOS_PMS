-- ─────────────────────────────────────────────────────────────────────────────
-- VERI*FACTU for Melend/OS's own invoices (Dan, 29/09/2026: "las facturas que
-- se generen para gestión sean con verifactu integrado"). The same engine as
-- the product's hotels (docs/verifactu.md): every issued invoice creates a
-- billing record chained with a SHA-256 fingerprint, sent to the AEAT by
-- verifactu-dispatch, and carries the tax QR. Melend/OS is the only issuer.
--
-- Scope: full invoices (F1, customers are always companies with a tax id)
-- and cancellations. Corrective invoices (R1…) are not here yet: an invoice
-- issued by mistake is cancelled and issued again.
--
-- Off until switched on in «Datos del emisor»: environment off → simulated
-- (nothing leaves) → pre (AEAT test portal) → prod. Outside prod the numbers
-- go in their own series (PMOS-…) so tests never use real numbers. Once there
-- are production records, neither the environment nor the issuer's NIF change.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;

alter table public.sales_settings
  add column verifactu_environment text not null default 'off'
    check (verifactu_environment in ('off', 'simulated', 'pre', 'prod')),
  add column installation_number text not null default '1'
    check (installation_number ~ '^[0-9A-Za-z]{1,100}$'),
  add column has_certificate boolean not null default false,
  add column verifactu_wait_seconds integer,
  add column verifactu_next_send_at timestamptz;

alter table public.client_invoices
  add column verifactu_env text check (verifactu_env in ('simulated', 'pre', 'prod'));

create table public.sales_verifactu_records (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            text not null default 'melendos',
  invoice_id           uuid not null references public.client_invoices(id),
  seq                  bigint not null unique,
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
  environment          text not null check (environment in ('simulated', 'pre', 'prod')),
  -- The AEAT's answer.
  status               text not null default 'pending' check (status in (
                         'pending', 'accepted', 'accepted_with_errors', 'rejected')),
  error_code           text,
  error                text,
  csv                  text,
  attempts             integer not null default 0,
  last_attempt_at      timestamptz,
  sent_at              timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id) on delete set null
);
create index sales_verifactu_pending_idx on public.sales_verifactu_records (seq) where status = 'pending';
create index sales_verifactu_invoice_idx on public.sales_verifactu_records (invoice_id);
alter table public.sales_verifactu_records enable row level security;
revoke all on public.sales_verifactu_records from anon, authenticated;
grant select on public.sales_verifactu_records to authenticated;
create policy "sales admins read" on public.sales_verifactu_records
  for select to authenticated using (public.is_sales_admin());

-- A record never changes after it is generated; only the AEAT's answer does.
create or replace function public.guard_sales_verifactu_record()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un registro de facturación no se puede borrar' using errcode = 'insufficient_privilege';
  end if;
  if (new.invoice_id, new.seq, new.kind, new.subsanacion, new.rechazo_previo, new.sin_registro_previo,
      new.issuer_nif, new.invoice_number, new.issue_date, new.invoice_type, new.cuota_total,
      new.importe_total, new.prev_hash, new.prev_number, new.generated_at, new.hash, new.environment)
     is distinct from
     (old.invoice_id, old.seq, old.kind, old.subsanacion, old.rechazo_previo, old.sin_registro_previo,
      old.issuer_nif, old.invoice_number, old.issue_date, old.invoice_type, old.cuota_total,
      old.importe_total, old.prev_hash, old.prev_number, old.generated_at, old.hash, old.environment) then
    raise exception 'Un registro de facturación no se puede modificar' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger sales_verifactu_records_guard before update or delete on public.sales_verifactu_records
  for each row execute function public.guard_sales_verifactu_record();

-- ── The same rules as the product (_shared/verifactu/hash.ts, domain.ts) ─────

create or replace function public.verifactu_hash(p_fields text[], p_values text[])
returns text language sql immutable set search_path = public, extensions as $$
  select upper(encode(extensions.digest(convert_to(
    (select string_agg(f || '=' || coalesce(btrim(v), ''), '&' order by i)
       from unnest(p_fields, p_values) with ordinality as t(f, v, i)), 'UTF8'), 'sha256'), 'hex'));
$$;

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

create or replace function public.normalized_tax_id(p text)
returns text language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[\s.-]', '', 'g')) $$;

-- Appends a record to the chain of its environment: previous record,
-- fingerprint and time (Madrid).
create or replace function public.sales_verifactu_append(
  p_invoice public.client_invoices, p_kind text, p_sin_registro_previo boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  prev public.sales_verifactu_records%rowtype;
  v_now text := public.verifactu_now('Europe/Madrid');
  v_nif text := public.normalized_tax_id(p_invoice.issuer->>'issuer_tax_id');
  v_date text := to_char(p_invoice.issued_on, 'DD-MM-YYYY');
  v_tax numeric := p_invoice.total - p_invoice.base;
  v_hash text;
  v_seq bigint;
  v_id uuid;
begin
  -- One chain at a time: records are appended in order.
  perform pg_advisory_xact_lock(hashtext('sales_verifactu_chain'));
  select * into prev from public.sales_verifactu_records
   where environment = p_invoice.verifactu_env order by seq desc limit 1;
  select coalesce(max(seq), 0) + 1 into v_seq from public.sales_verifactu_records;
  if p_kind = 'alta' then
    v_hash := public.verifactu_hash(
      array['IDEmisorFactura', 'NumSerieFactura', 'FechaExpedicionFactura', 'TipoFactura',
            'CuotaTotal', 'ImporteTotal', 'Huella', 'FechaHoraHusoGenRegistro'],
      array[v_nif, p_invoice.number, v_date, 'F1',
            public.aeat_amount(v_tax), public.aeat_amount(p_invoice.total), prev.hash, v_now]);
  else
    v_hash := public.verifactu_hash(
      array['IDEmisorFacturaAnulada', 'NumSerieFacturaAnulada', 'FechaExpedicionFacturaAnulada',
            'Huella', 'FechaHoraHusoGenRegistro'],
      array[v_nif, p_invoice.number, v_date, prev.hash, v_now]);
  end if;
  insert into public.sales_verifactu_records (
    invoice_id, seq, kind, sin_registro_previo, issuer_nif, invoice_number, issue_date,
    invoice_type, cuota_total, importe_total, prev_hash, prev_issuer_nif, prev_number,
    prev_issue_date, generated_at, hash, environment, created_by)
  values (
    p_invoice.id, v_seq, p_kind, p_sin_registro_previo, v_nif, p_invoice.number, v_date,
    case when p_kind = 'alta' then 'F1' end,
    case when p_kind = 'alta' then public.aeat_amount(v_tax) end,
    case when p_kind = 'alta' then public.aeat_amount(p_invoice.total) end,
    prev.hash, prev.issuer_nif, prev.invoice_number, prev.issue_date, v_now, v_hash,
    p_invoice.verifactu_env, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.sales_verifactu_append(public.client_invoices, text, boolean) from public, anon, authenticated;

-- Issuing: number, frozen issuer and client and, with VERI*FACTU on, the
-- billing record in the same transaction.
create or replace function public.issue_client_invoice(p_invoice uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from current_date);
  v_settings public.sales_settings%rowtype;
  v_env text;
  v_prefix text;
  v_seq int;
  v_number text;
  v_issuer jsonb;
  v_client public.clients%rowtype;
  v_row public.client_invoices%rowtype;
begin
  if not public.is_sales_admin() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  select * into v_settings from public.sales_settings for update;
  v_env := nullif(v_settings.verifactu_environment, 'off');
  v_issuer := to_jsonb(v_settings) - 'id' - 'updated_at' - 'verifactu_environment' - 'installation_number'
              - 'has_certificate' - 'verifactu_wait_seconds' - 'verifactu_next_send_at';
  select c.* into v_client from public.clients c
    join public.client_invoices i on i.client_id = c.id where i.id = p_invoice;

  if v_env is not null then
    if not (public.normalized_tax_id(v_settings.issuer_tax_id) ~ '^[0-9A-Z]{9}$')
       or coalesce(btrim(v_settings.issuer_name), '') = '' then
      raise exception 'VERI*FACTU: faltan la razón social o el NIF del emisor (Datos del emisor)'
        using errcode = 'check_violation';
    end if;
    if not (public.normalized_tax_id(v_client.tax_id) ~ '^[0-9A-Z]{9}$')
       or coalesce(btrim(coalesce(v_client.legal_name, v_client.name)), '') = '' then
      raise exception 'VERI*FACTU: al cliente le faltan la razón social o el NIF' using errcode = 'check_violation';
    end if;
  end if;

  v_prefix := case when v_env in ('simulated', 'pre') then 'PMOS' else 'MOS' end;
  perform pg_advisory_xact_lock(hashtext('client_invoices_number'));
  select coalesce(max(split_part(number, '-', 3)::int), 0) + 1 into v_seq
    from public.client_invoices where number like v_prefix || '-' || v_year || '-%';
  v_number := format('%s-%s-%s', v_prefix, v_year, lpad(v_seq::text, 4, '0'));

  update public.client_invoices i
     set status = 'issued', number = v_number, issued_on = current_date,
         due_on = coalesce(i.due_on, current_date + coalesce(v_settings.payment_days, 15)),
         issuer = v_issuer,
         verifactu_env = v_env,
         recipient = jsonb_build_object(
           'name', coalesce(v_client.legal_name, v_client.name), 'trade_name', v_client.name,
           'tax_id', case when v_env is not null then public.normalized_tax_id(v_client.tax_id) else v_client.tax_id end,
           'address', v_client.billing_address, 'email', v_client.billing_email)
   where i.id = p_invoice and i.status = 'draft'
   returning * into v_row;
  if not found then
    raise exception 'La factura no existe o ya está emitida' using errcode = 'no_data_found';
  end if;
  if v_env is not null then
    perform public.sales_verifactu_append(v_row, 'alta');
  end if;
  return v_number;
end;
$$;

-- Cancelling an invoice that has a billing record adds the cancellation
-- record (SinRegistroPrevio when the AEAT rejected the original).
create or replace function public.sales_verifactu_on_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_alta public.sales_verifactu_records%rowtype;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.verifactu_env is not null then
    select * into v_alta from public.sales_verifactu_records
     where invoice_id = new.id and kind = 'alta' order by seq desc limit 1;
    if v_alta.id is not null then
      perform public.sales_verifactu_append(new, 'anulacion', v_alta.status = 'rejected');
    end if;
  end if;
  return null;
end;
$$;
create trigger client_invoices_verifactu_cancel after update of status on public.client_invoices
  for each row execute function public.sales_verifactu_on_cancel();

-- The issued invoice also keeps the VERI*FACTU environment it was issued in.
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
    or new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end
    or new.issuer is distinct from old.issuer or new.recipient is distinct from old.recipient
    or new.verifactu_env is distinct from old.verifactu_env) then
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

-- With production records, the environment and the issuer's NIF stay put
-- (the rules do not allow using the system at will).
create or replace function public.guard_sales_settings()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.sales_verifactu_records where environment = 'prod') then
    if new.verifactu_environment is distinct from old.verifactu_environment then
      raise exception 'VERI*FACTU está en producción: no se puede cambiar de entorno' using errcode = 'check_violation';
    end if;
  end if;
  if exists (select 1 from public.sales_verifactu_records)
     and public.normalized_tax_id(new.issuer_tax_id) is distinct from public.normalized_tax_id(old.issuer_tax_id) then
    raise exception 'Ya hay registros de facturación con este NIF: no se puede cambiar' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger sales_settings_guard before update on public.sales_settings
  for each row execute function public.guard_sales_settings();

-- The QR of an invoice (_shared/verifactu/domain.ts: qrUrl).
create or replace function public.verifactu_qr_url(p_env text, p_nif text, p_number text, p_date date, p_total numeric)
returns text language sql immutable set search_path = public as $$
  select case when p_env = 'prod' then 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
              else 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR' end
    || '?nif=' || p_nif || '&numserie=' || p_number
    || '&fecha=' || to_char(p_date, 'DD-MM-YYYY') || '&importe=' || public.aeat_amount(p_total);
$$;

-- ── Certificate and scheduled sending ────────────────────────────────────────

-- The issuer's qualified certificate (PEM), in Vault. Platform only
-- (site/scripts/verifactu-setup.mjs --cert … --key …).
create or replace function public.save_sales_verifactu_certificate(p_cert text, p_key text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid; v_secret text;
begin
  if coalesce(p_cert, '') !~ '-----BEGIN CERTIFICATE-----' or coalesce(p_key, '') !~ '-----BEGIN [A-Z ]*PRIVATE KEY-----' then
    raise exception 'El certificado y la clave deben ir en formato PEM' using errcode = 'check_violation';
  end if;
  v_secret := jsonb_build_object('cert', p_cert, 'key', p_key)::text;
  select id into v_id from vault.secrets where name = 'verifactu/melendos';
  if v_id is null then
    perform vault.create_secret(v_secret, 'verifactu/melendos', 'VERI*FACTU certificate of Melend/OS');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
  update public.sales_settings set has_certificate = true;
end;
$$;
revoke all on function public.save_sales_verifactu_certificate(text, text) from public, anon, authenticated;

create or replace function public.sales_verifactu_certificate()
returns jsonb language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'verifactu/melendos' limit 1;
$$;
revoke all on function public.sales_verifactu_certificate() from public, anon, authenticated;

create or replace function public.sales_verifactu_tick()
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_url text; v_key text;
begin
  if not exists (
    select 1 from public.sales_verifactu_records r, public.sales_settings s
     where r.status = 'pending' and (s.verifactu_next_send_at is null or s.verifactu_next_send_at <= now())
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
revoke all on function public.sales_verifactu_tick() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('verifactu-dispatch', '* * * * *', $cron$ select public.sales_verifactu_tick(); $cron$);
exception when others then
  raise notice 'pg_cron not available: VERI*FACTU dispatch not scheduled (%)', sqlerrm;
end $$;
