-- ─────────────────────────────────────────────────────────────────────────────
-- The management panel only works from trusted devices, from any network
-- (Dan, 29/09/2026: "algo que identifique los equipos… proteger la web pero
-- no estar vetado cada vez que me mueva"; replaces the IP allowlist, which
-- breaks with mobile data, CG-NAT and travel).
--
-- Each browser keeps an ECDSA key pair whose private half cannot be exported
-- and registers the public half here. At sign-in it signs its Supabase
-- session; the device-session function checks the signature and, if the
-- device is approved, records the session as trusted. is_sales_admin(), which
-- every policy of the panel uses, only holds for trusted sessions: a stolen
-- password is useless without an approved device.
--
-- A new device is approved from a trusted one, or with the code of the
-- authenticator app (a session verified with TOTP, aal2). Recovery with
-- direct database access: site/scripts/admin-devices.mjs.
-- ─────────────────────────────────────────────────────────────────────────────

-- The IP allowlist goes (it was never switched on).
drop function if exists public.admin_ip_allowed(text);
drop function if exists public.add_admin_ip(text, text);
drop function if exists public.remove_admin_ip(uuid);
drop function if exists public.list_admin_ips();
drop function if exists public.sales_access();
drop table if exists public.sales_allowed_ips;

create table public.sales_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (length(name) between 1 and 80),
  public_key    jsonb not null,
  created_at    timestamptz not null default now(),
  approved_at   timestamptz,
  approved_via  text check (approved_via in ('mfa', 'device', 'script')),
  approved_by   uuid references auth.users(id) on delete set null,
  last_seen_at  timestamptz,
  revoked_at    timestamptz
);
create index sales_devices_user_idx on public.sales_devices (user_id);

create table public.sales_device_sessions (
  session_id uuid primary key,
  device_id  uuid not null references public.sales_devices(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Only the functions below and the device-session function (service role).
alter table public.sales_devices enable row level security;
alter table public.sales_device_sessions enable row level security;
revoke all on public.sales_devices, public.sales_device_sessions from anon, authenticated;

create or replace function public.sales_session_id()
returns uuid language plpgsql stable set search_path = public as $$
begin
  return nullif(auth.jwt()->>'session_id', '')::uuid;
exception when others then
  return null;
end;
$$;

-- The current session was signed by an approved, not revoked device.
create or replace function public.sales_session_trusted()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sales_device_sessions s
      join public.sales_devices d on d.id = s.device_id
     where s.session_id = public.sales_session_id()
       and s.user_id = auth.uid()
       and s.expires_at > now()
       and d.approved_at is not null
       and d.revoked_at is null);
$$;
revoke all on function public.sales_session_trusted() from public, anon;
grant execute on function public.sales_session_trusted() to authenticated;

create or replace function public.is_sales_account()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sales_admins where user_id = auth.uid());
$$;
revoke all on function public.is_sales_account() from public, anon;
grant execute on function public.is_sales_account() to authenticated;

-- Every policy of the panel goes through here: an admin, on a trusted device.
create or replace function public.is_sales_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_sales_account() and public.sales_session_trusted();
$$;

drop function if exists public.sales_ip_allowed(inet);
drop function if exists public.sales_request_ip();

-- A browser registers its public key (pending until approved). Accounts of
-- the panel only; at most 10 pending devices per person.
create or replace function public.register_sales_device(p_name text, p_public_key jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_sales_account() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if p_public_key->>'kty' is distinct from 'EC' or p_public_key->>'crv' is distinct from 'P-256'
     or p_public_key ? 'd' or p_public_key->>'x' is null or p_public_key->>'y' is null then
    raise exception 'Clave de equipo no válida' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(*) from public.sales_devices
       where user_id = auth.uid() and approved_at is null and revoked_at is null) >= 10 then
    raise exception 'Demasiados equipos pendientes: aprueba o revoca alguno' using errcode = 'check_violation';
  end if;
  insert into public.sales_devices (user_id, name, public_key)
  values (auth.uid(), left(coalesce(nullif(btrim(p_name), ''), 'Equipo'), 80),
          jsonb_build_object('kty', 'EC', 'crv', 'P-256', 'x', p_public_key->>'x', 'y', p_public_key->>'y'))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.register_sales_device(text, jsonb) from public, anon;
grant execute on function public.register_sales_device(text, jsonb) to authenticated;

-- Approval of one of your own devices with the authenticator app's code
-- (the session was just verified with TOTP).
create or replace function public.approve_sales_device_with_mfa(p_device uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_sales_account() or coalesce(auth.jwt()->>'aal', '') <> 'aal2' then
    raise exception 'Hace falta el código de la app de autenticación' using errcode = 'insufficient_privilege';
  end if;
  update public.sales_devices
     set approved_at = now(), approved_via = 'mfa', approved_by = auth.uid()
   where id = p_device and user_id = auth.uid() and revoked_at is null and approved_at is null;
  if not found then
    raise exception 'Equipo no encontrado' using errcode = 'no_data_found';
  end if;
end;
$$;
revoke all on function public.approve_sales_device_with_mfa(uuid) from public, anon;
grant execute on function public.approve_sales_device_with_mfa(uuid) to authenticated;

-- Approval from a trusted device (any pending device of the team).
create or replace function public.approve_sales_device(p_device uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_sales_admin() then
    raise exception 'Solo desde un equipo de confianza' using errcode = 'insufficient_privilege';
  end if;
  update public.sales_devices
     set approved_at = now(), approved_via = 'device', approved_by = auth.uid()
   where id = p_device and revoked_at is null and approved_at is null;
  if not found then
    raise exception 'Equipo no encontrado o ya aprobado' using errcode = 'no_data_found';
  end if;
end;
$$;
revoke all on function public.approve_sales_device(uuid) from public, anon;
grant execute on function public.approve_sales_device(uuid) to authenticated;

-- Revoking cuts its sessions at once (lost laptop, sold phone).
create or replace function public.revoke_sales_device(p_device uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_sales_admin() then
    raise exception 'Solo desde un equipo de confianza' using errcode = 'insufficient_privilege';
  end if;
  update public.sales_devices set revoked_at = now() where id = p_device and revoked_at is null;
  if not found then
    raise exception 'Equipo no encontrado' using errcode = 'no_data_found';
  end if;
  delete from public.sales_device_sessions where device_id = p_device;
end;
$$;
revoke all on function public.revoke_sales_device(uuid) from public, anon;
grant execute on function public.revoke_sales_device(uuid) to authenticated;

create or replace function public.list_sales_devices()
returns table (id uuid, owner text, name text, created_at timestamptz, approved_at timestamptz,
               approved_via text, last_seen_at timestamptz, revoked_at timestamptz, is_current boolean)
language sql stable security definer set search_path = public, auth as $$
  select d.id, u.email::text, d.name, d.created_at, d.approved_at, d.approved_via, d.last_seen_at,
         d.revoked_at,
         exists (select 1 from public.sales_device_sessions s
                  where s.device_id = d.id and s.session_id = public.sales_session_id())
    from public.sales_devices d
    join auth.users u on u.id = d.user_id
   where public.is_sales_admin()
   order by d.revoked_at is not null, d.approved_at is null desc, d.last_seen_at desc nulls last;
$$;
revoke all on function public.list_sales_devices() from public, anon;
grant execute on function public.list_sales_devices() to authenticated;
