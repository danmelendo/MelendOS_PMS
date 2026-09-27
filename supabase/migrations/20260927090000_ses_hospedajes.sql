-- ─────────────────────────────────────────────────────────────────────────────
-- Spanish traveller register: SES.HOSPEDAJES (Real Decreto 933/2021).
-- A hotel reports to the Ministry of the Interior, within 24 hours:
-- - every booking (RH) when it is made, changed or cancelled;
-- - every guest (PV, "parte de viajeros") at check-in.
-- The data of each guest lives in stay_travellers (sensitive: no policies, only
-- the functions below; staff lists show it masked). ses_communications is the
-- queue, filled by triggers on reservations and emptied by the ses-dispatch
-- Edge Function (every 10 minutes, or "Enviar ahora" in the panel), which reads
-- the data at send time, validates it (@domain/ses.ts), sends it and collects
-- the ministry's answer. Credentials per hotel in Vault (ses/<tenant>).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Configuration ────────────────────────────────────────────────────────────
create table public.ses_settings (
  tenant_id        uuid primary key references public.tenants(id) on delete cascade,
  enabled          boolean not null default false,
  -- simulated: answers like the ministry without leaving the server (demo, or
  -- while the hotel waits for its credentials); pre: the ministry's test
  -- environment; prod: the real register.
  environment      text not null default 'simulated' check (environment in ('simulated', 'pre', 'prod')),
  landlord_code    text check (landlord_code ~ '^[0-9A-Za-z]{1,10}$'),
  app_name         text not null default 'Demo Stays PMS' check (char_length(app_name) between 1 and 50),
  has_credentials  boolean not null default false,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id) on delete set null
);
alter table public.ses_settings enable row level security;
create policy ses_settings_staff_read on public.ses_settings
  for select to authenticated using (public.is_tenant_member(tenant_id));

-- Code the ministry gives each establishment (hotel) when it is registered.
create table public.ses_establishments (
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  property_id  uuid not null,
  code         text not null check (code ~ '^[0-9A-Za-z]{1,10}$'),
  primary key (tenant_id, property_id),
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id) on delete cascade
);
alter table public.ses_establishments enable row level security;
create policy ses_establishments_staff_read on public.ses_establishments
  for select to authenticated using (public.is_tenant_member(tenant_id));

-- ── Guests of each stay ──────────────────────────────────────────────────────
create table public.stay_travellers (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  reservation_id     uuid not null,
  is_holder          boolean not null default false,
  first_name         text not null check (char_length(btrim(first_name)) between 1 and 50),
  last_name1         text check (char_length(last_name1) <= 50),
  last_name2         text check (char_length(last_name2) <= 50),
  document_type      text check (document_type in ('NIF', 'NIE', 'PAS', 'OTRO')),
  document_number    text check (char_length(document_number) <= 15),
  document_support   text check (char_length(document_support) <= 9),
  birth_date         date check (birth_date between '1900-01-01' and current_date),
  nationality        text check (nationality ~ '^[A-Z]{3}$'),
  sex                text check (sex in ('H', 'M', 'O')),
  address            text check (char_length(address) <= 100),
  address_extra      text check (char_length(address_extra) <= 100),
  municipality_code  text check (municipality_code ~ '^[0-9]{5}$'),
  municipality_name  text check (char_length(municipality_name) <= 100),
  postal_code        text check (char_length(postal_code) <= 20),
  country            text check (country ~ '^[A-Z]{3}$'),
  phone              text check (char_length(phone) <= 20),
  phone2             text check (char_length(phone2) <= 20),
  email              text check (char_length(email) <= 250),
  kinship            text check (kinship ~ '^[A-Z]{2}$'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null,
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete cascade
);
create index stay_travellers_reservation_idx on public.stay_travellers (reservation_id);
create unique index stay_travellers_one_holder on public.stay_travellers (reservation_id) where is_holder;
alter table public.stay_travellers enable row level security;
revoke all on public.stay_travellers from anon, authenticated;
create trigger stay_travellers_no_group_operations before insert or update or delete on public.stay_travellers
  for each row execute function public.forbid_group_operations();

-- What a traveller report still needs from one guest (field names). Mirror of
-- the required fields of travellerIssues() in @domain/ses.ts; formats (DNI
-- letter, lengths) are checked there, at send time.
create or replace function public.ses_traveller_missing(t public.stay_travellers, p_check_in date)
returns text[] language sql immutable set search_path = public as $$
  with a as (
    select coalesce(t.birth_date is null or t.birth_date <= p_check_in - interval '18 years', true) as adult
  )
  select array_remove(array[
    case when coalesce(btrim(t.last_name1), '') = '' then 'last_name1' end,
    case when t.birth_date is null then 'birth_date' end,
    case when a.adult and t.document_type is null then 'document_type' end,
    case when (a.adult or t.document_type is not null) and coalesce(btrim(t.document_number), '') = '' then 'document_number' end,
    case when t.document_type = 'NIF' and coalesce(btrim(t.last_name2), '') = '' then 'last_name2' end,
    case when t.document_type in ('NIF', 'NIE') and coalesce(btrim(t.document_support), '') = '' then 'document_support' end,
    case when coalesce(btrim(t.address), '') = '' then 'address' end,
    case when coalesce(btrim(t.postal_code), '') = '' then 'postal_code' end,
    case when t.country is null then 'country' end,
    case when t.country = 'ESP' and t.municipality_code is null then 'municipality_code' end,
    case when t.country is not null and t.country <> 'ESP' and coalesce(btrim(t.municipality_name), '') = '' then 'municipality_name' end,
    case when coalesce(btrim(t.phone), '') = '' and coalesce(btrim(t.phone2), '') = '' and coalesce(btrim(t.email), '') = '' then 'phone' end,
    case when not a.adult and t.kinship is null then 'kinship' end
  ], null)
  from a;
$$;

-- ── Queue ────────────────────────────────────────────────────────────────────
create table public.ses_communications (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  reservation_id  uuid not null,
  kind            text not null check (kind in ('PV', 'RH')),
  operation       text not null default 'A' check (operation in ('A', 'B')),
  -- For a cancellation ("B"): the communication it cancels.
  target_id       uuid references public.ses_communications(id) on delete set null,
  status          text not null default 'pending' check (status in (
                    'pending',   -- waiting to be sent
                    'blocked',   -- data missing (error says what); retried every run
                    'sent',      -- in a batch, waiting for the ministry
                    'accepted',  -- registered (ses_code) or, for a "B", cancelled
                    'rejected',  -- refused by the ministry (error); "Reenviar" after fixing
                    'error',     -- could not be sent; retried up to 5 times
                    'skipped',   -- no longer needed (booking cancelled before sending)
                    'cancelled')), -- registered and later cancelled with a "B"
  due_at          timestamptz not null default now() + interval '24 hours',
  batch           text,
  batch_order     integer,
  ses_code        text,
  error           text,
  attempts        integer not null default 0,
  sent_at         timestamptz,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete cascade
);
create index ses_communications_work_idx on public.ses_communications (tenant_id, status)
  where status in ('pending', 'blocked', 'sent', 'error');
create index ses_communications_reservation_idx on public.ses_communications (reservation_id);
create trigger ses_communications_updated_at before update on public.ses_communications
  for each row execute function public.set_updated_at();
alter table public.ses_communications enable row level security;
create policy ses_communications_staff_read on public.ses_communications
  for select to authenticated using (public.is_tenant_member(tenant_id));

-- Queues what each change of a booking requires.
create or replace function public.queue_ses_communications()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_active constant text[] := array['confirmed', 'in_progress', 'completed'];
  r record;
begin
  if new.simulated or not exists (
    select 1 from public.ses_settings where tenant_id = new.tenant_id and enabled
  ) then
    return new;
  end if;

  -- Cancelled or refused: withdraw what was reported, drop what was not.
  if new.status in ('cancelled', 'rejected') then
    if tg_op = 'UPDATE' and old.status not in ('cancelled', 'rejected') then
      update public.ses_communications
         set status = 'skipped', error = null
       where reservation_id = new.id and status in ('pending', 'blocked', 'error');
      for r in
        select c.id, c.kind from public.ses_communications c
         where c.reservation_id = new.id and c.operation = 'A' and c.status in ('sent', 'accepted')
           and not exists (select 1 from public.ses_communications b where b.target_id = c.id)
      loop
        insert into public.ses_communications (tenant_id, reservation_id, kind, operation, target_id)
        values (new.tenant_id, new.id, r.kind, 'B', r.id);
      end loop;
    end if;
    return new;
  end if;

  -- Booking made (or confirmed on payment): report it.
  if new.status::text = any (v_active) and (tg_op = 'INSERT' or not old.status::text = any (v_active)) then
    if not exists (
      select 1 from public.ses_communications
       where reservation_id = new.id and kind = 'RH' and operation = 'A'
         and status not in ('skipped', 'cancelled', 'rejected')
    ) then
      insert into public.ses_communications (tenant_id, reservation_id, kind)
      values (new.tenant_id, new.id, 'RH');
    end if;
  -- Dates or guests changed after it was reported: cancel it and report again.
  -- (Before sending there is nothing to do: data is read at send time.)
  elsif tg_op = 'UPDATE' and new.status::text = any (v_active)
        and (new.start_at, new.end_at, new.people) is distinct from (old.start_at, old.end_at, old.people) then
    for r in
      select c.id from public.ses_communications c
       where c.reservation_id = new.id and c.kind = 'RH' and c.operation = 'A'
         and c.status in ('sent', 'accepted')
         and not exists (select 1 from public.ses_communications b where b.target_id = c.id)
    loop
      insert into public.ses_communications (tenant_id, reservation_id, kind, operation, target_id)
      values (new.tenant_id, new.id, 'RH', 'B', r.id);
      insert into public.ses_communications (tenant_id, reservation_id, kind)
      values (new.tenant_id, new.id, 'RH');
    end loop;
  end if;

  -- Check-in: the traveller report of everyone staying.
  if new.status = 'in_progress' and (tg_op = 'INSERT' or old.status <> 'in_progress')
     and not exists (
       select 1 from public.ses_communications
        where reservation_id = new.id and kind = 'PV' and operation = 'A'
          and status not in ('skipped', 'cancelled', 'rejected')
     ) then
    insert into public.ses_communications (tenant_id, reservation_id, kind)
    values (new.tenant_id, new.id, 'PV');
  end if;
  return new;
end;
$$;
create trigger reservations_queue_ses
  after insert or update of status, start_at, end_at, people on public.reservations
  for each row execute function public.queue_ses_communications();
revoke execute on function public.queue_ses_communications() from public, anon, authenticated;

-- ── Functions for the panel ──────────────────────────────────────────────────

-- Admins (and group management) configure the register of their hotel.
create or replace function public.save_ses_settings(p_tenant uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare k text; v text;
begin
  if not public.has_tenant_role(p_tenant, 'admin') then
    raise exception 'Solo dirección puede configurar el registro de viajeros' using errcode = 'insufficient_privilege';
  end if;
  insert into public.ses_settings as s (tenant_id, enabled, environment, landlord_code, app_name, updated_by)
  values (
    p_tenant,
    coalesce((p_data->>'enabled')::boolean, false),
    coalesce(p_data->>'environment', 'simulated'),
    nullif(btrim(p_data->>'landlord_code'), ''),
    coalesce(nullif(btrim(p_data->>'app_name'), ''), 'Demo Stays PMS'),
    auth.uid())
  on conflict (tenant_id) do update set
    enabled = coalesce((p_data->>'enabled')::boolean, s.enabled),
    environment = coalesce(p_data->>'environment', s.environment),
    landlord_code = case when p_data ? 'landlord_code' then nullif(btrim(p_data->>'landlord_code'), '') else s.landlord_code end,
    app_name = coalesce(nullif(btrim(p_data->>'app_name'), ''), s.app_name),
    updated_at = now(),
    updated_by = auth.uid();

  -- establishments: { "<property id>": "<code>" | "" }
  for k, v in select key, btrim(value) from jsonb_each_text(coalesce(p_data->'establishments', '{}'::jsonb))
  loop
    if coalesce(v, '') = '' then
      delete from public.ses_establishments where tenant_id = p_tenant and property_id = k::uuid;
    else
      insert into public.ses_establishments (tenant_id, property_id, code)
      values (p_tenant, k::uuid, v)
      on conflict (tenant_id, property_id) do update set code = excluded.code;
    end if;
  end loop;
end;
$$;

-- The ministry's user and password (and, if needed, its certificate chain).
create or replace function public.save_ses_credentials(p_tenant uuid, p_user text, p_password text, p_ca_cert text default null)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid; v_name text := 'ses/' || p_tenant::text; v_secret text;
begin
  if not public.has_tenant_role(p_tenant, 'admin') then
    raise exception 'Solo dirección puede guardar las credenciales' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_user), '') = '' or coalesce(p_password, '') = '' then
    raise exception 'Faltan el usuario o la contraseña' using errcode = 'check_violation';
  end if;
  v_secret := jsonb_build_object('user', btrim(p_user), 'password', p_password,
                                 'ca_cert', nullif(btrim(p_ca_cert), ''))::text;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(v_secret, v_name, 'SES.HOSPEDAJES credentials');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
  insert into public.ses_settings (tenant_id, has_credentials, updated_by)
  values (p_tenant, true, auth.uid())
  on conflict (tenant_id) do update set has_credentials = true, updated_at = now(), updated_by = auth.uid();
  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id)
  values (p_tenant, auth.uid(), 'ses.credentials_saved', 'ses_settings', p_tenant);
end;
$$;

-- Only the server reads them.
create or replace function public.ses_credentials(p_tenant uuid)
returns jsonb language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'ses/' || p_tenant::text limit 1;
$$;

-- Reception or admins record (or correct) a guest of a stay. On a correction,
-- fields not in p_data keep their value (the panel never shows them back).
create or replace function public.save_stay_traveller(p_reservation uuid, p_data jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  select tenant_id into v_tenant from public.reservations where id = p_reservation;
  if v_tenant is null or not public.is_tenant_staff(v_tenant) then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if coalesce((p_data->>'is_holder')::boolean, false) then
    update public.stay_travellers set is_holder = false
     where reservation_id = p_reservation and is_holder and id is distinct from p_id;
  end if;
  if p_id is null then
    insert into public.stay_travellers (tenant_id, reservation_id, first_name, updated_by)
    values (v_tenant, p_reservation, coalesce(nullif(btrim(p_data->>'first_name'), ''), '?'), auth.uid())
    returning id into v_id;
  else
    select id into v_id from public.stay_travellers where id = p_id and reservation_id = p_reservation;
    if v_id is null then
      raise exception 'Viajero no encontrado' using errcode = 'no_data_found';
    end if;
  end if;
  update public.stay_travellers set
    is_holder = case when p_data ? 'is_holder' then coalesce((p_data->>'is_holder')::boolean, false) else is_holder end,
    first_name = case when p_data ? 'first_name' then btrim(p_data->>'first_name') else first_name end,
    last_name1 = case when p_data ? 'last_name1' then nullif(btrim(p_data->>'last_name1'), '') else last_name1 end,
    last_name2 = case when p_data ? 'last_name2' then nullif(btrim(p_data->>'last_name2'), '') else last_name2 end,
    document_type = case when p_data ? 'document_type' then nullif(p_data->>'document_type', '') else document_type end,
    document_number = case when p_data ? 'document_number' then nullif(upper(regexp_replace(p_data->>'document_number', '[\s-]', '', 'g')), '') else document_number end,
    document_support = case when p_data ? 'document_support' then nullif(upper(regexp_replace(p_data->>'document_support', '[\s-]', '', 'g')), '') else document_support end,
    birth_date = case when p_data ? 'birth_date' then nullif(p_data->>'birth_date', '')::date else birth_date end,
    nationality = case when p_data ? 'nationality' then nullif(upper(p_data->>'nationality'), '') else nationality end,
    sex = case when p_data ? 'sex' then nullif(p_data->>'sex', '') else sex end,
    address = case when p_data ? 'address' then nullif(btrim(p_data->>'address'), '') else address end,
    address_extra = case when p_data ? 'address_extra' then nullif(btrim(p_data->>'address_extra'), '') else address_extra end,
    municipality_code = case when p_data ? 'municipality_code' then nullif(btrim(p_data->>'municipality_code'), '') else municipality_code end,
    municipality_name = case when p_data ? 'municipality_name' then nullif(btrim(p_data->>'municipality_name'), '') else municipality_name end,
    postal_code = case when p_data ? 'postal_code' then nullif(btrim(p_data->>'postal_code'), '') else postal_code end,
    country = case when p_data ? 'country' then nullif(upper(p_data->>'country'), '') else country end,
    phone = case when p_data ? 'phone' then nullif(btrim(p_data->>'phone'), '') else phone end,
    phone2 = case when p_data ? 'phone2' then nullif(btrim(p_data->>'phone2'), '') else phone2 end,
    email = case when p_data ? 'email' then nullif(lower(btrim(p_data->>'email')), '') else email end,
    kinship = case when p_data ? 'kinship' then nullif(p_data->>'kinship', '') else kinship end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_id;
  -- A blocked report is tried again on the next run.
  update public.ses_communications set status = 'pending'
   where reservation_id = p_reservation and status = 'blocked';
  return v_id;
end;
$$;

create or replace function public.delete_stay_traveller(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.stay_travellers where id = p_id;
  if v_tenant is null or not public.is_tenant_staff(v_tenant) then
    raise exception 'Viajero no encontrado' using errcode = 'no_data_found';
  end if;
  delete from public.stay_travellers where id = p_id;
end;
$$;

-- Guests of a stay for staff: names, what is missing and the document masked.
-- Nobody reads the full data back from the panel; the server sends it.
create or replace function public.list_stay_travellers(p_reservation uuid)
returns table (
  id uuid, is_holder boolean, first_name text, last_name1 text, last_name2 text,
  document_type text, document_hint text, nationality text, is_minor boolean,
  kinship text, missing text[]
) language plpgsql stable security definer set search_path = public as $$
declare v_tenant uuid; v_check_in date;
begin
  select r.tenant_id, (r.start_at at time zone coalesce(t.settings->>'timezone', 'Europe/Madrid'))::date
    into v_tenant, v_check_in
    from public.reservations r join public.tenants t on t.id = r.tenant_id
   where r.id = p_reservation;
  if v_tenant is null or not public.is_tenant_member(v_tenant) then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  return query
    select s.id, s.is_holder, s.first_name, s.last_name1, s.last_name2, s.document_type,
           case when s.document_number is null then null
                else repeat('•', least(6, greatest(char_length(s.document_number) - 3, 0))) || right(s.document_number, 3) end,
           s.nationality,
           coalesce(s.birth_date > v_check_in - interval '18 years', false),
           s.kinship,
           public.ses_traveller_missing(s, v_check_in)
      from public.stay_travellers s
     where s.reservation_id = p_reservation
     order by s.is_holder desc, s.created_at;
end;
$$;

-- Send again after fixing what the ministry refused.
create or replace function public.ses_retry(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.ses_communications where id = p_id;
  if v_tenant is null or not public.is_tenant_staff(v_tenant) then
    raise exception 'Comunicación no encontrada' using errcode = 'no_data_found';
  end if;
  update public.ses_communications
     set status = 'pending', attempts = 0, error = null, batch = null, batch_order = null
   where id = p_id and status in ('rejected', 'error', 'blocked');
end;
$$;

revoke execute on function public.save_ses_settings(uuid, jsonb) from public, anon;
revoke execute on function public.save_ses_credentials(uuid, text, text, text) from public, anon;
revoke execute on function public.ses_credentials(uuid) from public, anon, authenticated;
grant execute on function public.ses_credentials(uuid) to service_role;
revoke execute on function public.save_stay_traveller(uuid, jsonb, uuid) from public, anon;
revoke execute on function public.delete_stay_traveller(uuid) from public, anon;
revoke execute on function public.list_stay_travellers(uuid) from public, anon;
revoke execute on function public.ses_retry(uuid) from public, anon;
grant execute on function public.save_ses_settings(uuid, jsonb), public.save_ses_credentials(uuid, text, text, text),
  public.save_stay_traveller(uuid, jsonb, uuid), public.delete_stay_traveller(uuid),
  public.list_stay_travellers(uuid), public.ses_retry(uuid) to authenticated;

-- ── Schedule ─────────────────────────────────────────────────────────────────
-- Every 10 minutes, if some hotel has work, the database calls ses-dispatch.
-- The function URL and the service key are Vault secrets (ses/cron_url,
-- ses/cron_key) set by scripts/ses-setup.mjs; without them nothing is called.
create or replace function public.ses_dispatch_tick()
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_url text; v_key text;
begin
  if not exists (
    select 1 from public.ses_communications c
      join public.ses_settings s on s.tenant_id = c.tenant_id and s.enabled
     where c.status in ('pending', 'blocked', 'sent') or (c.status = 'error' and c.attempts < 5)
  ) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'ses/cron_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'ses/cron_key';
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
revoke execute on function public.ses_dispatch_tick() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_net;
  create extension if not exists pg_cron;
  perform cron.schedule('ses-dispatch', '*/10 * * * *', $cron$ select public.ses_dispatch_tick(); $cron$);
exception when others then
  raise notice 'pg_net/pg_cron not available: SES dispatch not scheduled (%)', sqlerrm;
end $$;
