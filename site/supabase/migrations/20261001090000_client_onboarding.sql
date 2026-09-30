-- ─────────────────────────────────────────────────────────────────────────────
-- Onboarding form for new customers (Dan, 01/10/2026: "una vez el hotel ha
-- firmado contrato, dirigirle a un formulario que nos proporcione los datos
-- necesarios + archivos Excel para darlo de alta"; "si se pasa el cliente a
-- «en implantación» se dispara automáticamente el correo de alta").
--
--   clients.contact_email       who fills it in (falls back to billing_email)
--   client_onboarding           one form per customer: its private link (only
--                               the hash is kept), what they filled in, status
--   client_onboarding_files     their uploads (Excel of rooms, reservations,
--                               logo, photos) in the private bucket
--                               "onboarding"
--
-- A customer in "onboarding" (En implantación) with an email gets a form
-- queued; the onboarding function sends it (pg_cron + Vault, like VERI*FACTU)
-- and serves the public page /alta/?t=… by that link only. Sales admins see
-- and manage everything (RLS); anonymous users nothing.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.clients
  add column contact_email text
    check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

create table public.client_onboarding (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  -- queued → sent → in_progress (opened) → submitted → completed (hotel set up)
  status        text not null default 'queued'
                  check (status in ('queued', 'sent', 'in_progress', 'submitted', 'completed', 'cancelled')),
  email         text not null,
  -- sha256 of the link's token; null until sent (and again when resent).
  token_hash    text unique,
  expires_at    timestamptz,
  data          jsonb not null default '{}'::jsonb,
  send_attempts integer not null default 0,
  last_error    text,
  sent_at       timestamptz,
  opened_at     timestamptz,
  submitted_at  timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- One open form per customer.
create unique index client_onboarding_open_idx on public.client_onboarding (client_id)
  where status not in ('completed', 'cancelled');
create index client_onboarding_queue_idx on public.client_onboarding (status) where status = 'queued';

create table public.client_onboarding_files (
  id            uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.client_onboarding(id) on delete cascade,
  kind          text not null check (kind in ('rooms', 'reservations', 'logo', 'photos', 'other')),
  name          text not null,
  path          text not null unique,
  size          bigint not null check (size > 0),
  content_type  text,
  created_at    timestamptz not null default now()
);
create index client_onboarding_files_idx on public.client_onboarding_files (onboarding_id);

alter table public.client_onboarding enable row level security;
alter table public.client_onboarding_files enable row level security;

create policy client_onboarding_admin on public.client_onboarding
  for all to authenticated using (public.is_sales_admin()) with check (public.is_sales_admin());
create policy client_onboarding_files_admin on public.client_onboarding_files
  for all to authenticated using (public.is_sales_admin()) with check (public.is_sales_admin());

create or replace function public.touch_client_onboarding()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger client_onboarding_touch before update on public.client_onboarding
  for each row execute function public.touch_client_onboarding();

-- Private bucket for the uploads: the function hands out signed upload URLs to
-- the link's holder; sales admins download and delete them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('onboarding', 'onboarding', false, 20 * 1024 * 1024, array[
  'text/csv', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet', 'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'application/zip', 'text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy onboarding_files_admin_read on storage.objects
  for select to authenticated using (bucket_id = 'onboarding' and public.is_sales_admin());
create policy onboarding_files_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'onboarding' and public.is_sales_admin());

-- Wakes the onboarding function when there are forms to send (every minute,
-- and right away from the trigger below). Only calls it if something waits.
create or replace function public.sales_onboarding_tick()
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_url text; v_key text;
begin
  if not exists (select 1 from public.client_onboarding where status = 'queued' and send_attempts < 5) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'onboarding/cron_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'onboarding/cron_key';
  if v_url is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{"action":"dispatch"}'::jsonb,
    timeout_milliseconds := 30000);
end;
$$;
revoke all on function public.sales_onboarding_tick() from public, anon, authenticated;

-- A customer in "onboarding" with an email gets its form, once: moving it
-- again to onboarding or changing its email does not send a second one
-- (resend_client_onboarding does, from the panel).
create or replace function public.queue_client_onboarding()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text := coalesce(nullif(btrim(new.contact_email), ''), nullif(btrim(new.billing_email), ''));
begin
  if new.status = 'onboarding' and v_email is not null
     and not exists (select 1 from public.client_onboarding where client_id = new.id) then
    insert into public.client_onboarding (client_id, email) values (new.id, lower(v_email));
    perform public.sales_onboarding_tick();
  end if;
  return new;
end;
$$;
create trigger clients_queue_onboarding
  after insert or update of status, contact_email, billing_email on public.clients
  for each row execute function public.queue_client_onboarding();

-- Panel: send the form again (new link; the previous one stops working), to
-- the customer's current email. Opens a new form if the last one was closed.
create or replace function public.resend_client_onboarding(p_client uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c public.clients%rowtype;
  v_email text;
  v_id uuid;
begin
  if not public.is_sales_admin() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.clients where id = p_client;
  if not found then
    raise exception 'Cliente no encontrado' using errcode = 'no_data_found';
  end if;
  v_email := lower(coalesce(nullif(btrim(c.contact_email), ''), nullif(btrim(c.billing_email), '')));
  if v_email is null then
    raise exception 'El cliente no tiene email de contacto' using errcode = 'check_violation';
  end if;
  update public.client_onboarding
     set status = 'queued', email = v_email, token_hash = null, expires_at = null,
         send_attempts = 0, last_error = null
   where client_id = p_client and status not in ('completed', 'cancelled')
  returning id into v_id;
  if v_id is null then
    insert into public.client_onboarding (client_id, email) values (p_client, v_email) returning id into v_id;
  end if;
  perform public.sales_onboarding_tick();
  return v_id;
end;
$$;
revoke all on function public.resend_client_onboarding(uuid) from public, anon;
grant execute on function public.resend_client_onboarding(uuid) to authenticated;

do $$
begin
  perform cron.schedule('onboarding-dispatch', '* * * * *', $cron$ select public.sales_onboarding_tick(); $cron$);
exception when others then
  raise notice 'pg_cron not available: onboarding dispatch not scheduled (%)', sqlerrm;
end $$;
