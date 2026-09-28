-- ─────────────────────────────────────────────────────────────────────────────
-- Management panel only from allowed IPs (Dan, 29/09/2026: "proteger /admin y
-- lo que cuelga de ella: que solo se pueda acceder desde las IPs que yo
-- permita"). Two layers over one list:
--   · the page: Vercel middleware (site/middleware.ts) asks admin_ip_allowed()
--     and answers 403 to anyone else;
--   · the data: is_sales_admin(), which every policy uses, also requires the
--     IP of the request, so the API refuses leads, clients and invoices to an
--     allowed account connecting from elsewhere.
-- An empty list means no restriction (so nobody is locked out before setting
-- it up); the first range added has to include the IP of whoever adds it, and
-- nobody can remove the range they are connecting from. Recovery with direct
-- database access: site/scripts/admin-ips.mjs.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.sales_allowed_ips (
  id         uuid primary key default gen_random_uuid(),
  network    cidr not null unique,
  label      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- No huge ranges: at least /16 in IPv4 and /48 in IPv6.
  check ((family(network) = 4 and masklen(network) >= 16) or (family(network) = 6 and masklen(network) >= 48))
);
alter table public.sales_allowed_ips enable row level security;
revoke all on public.sales_allowed_ips from anon, authenticated;

-- The caller's IP as the API sees it (Cloudflare sits in front of Supabase and
-- sets cf-connecting-ip; the others are fallbacks). Null outside an API call.
create or replace function public.sales_request_ip()
returns inet language plpgsql stable set search_path = public as $$
declare
  h json;
  v text;
begin
  h := nullif(current_setting('request.headers', true), '')::json;
  v := coalesce(h->>'cf-connecting-ip', split_part(h->>'x-forwarded-for', ',', 1), h->>'x-real-ip');
  return nullif(btrim(v), '')::inet;
exception when others then
  return null;
end;
$$;
revoke all on function public.sales_request_ip() from public;
grant execute on function public.sales_request_ip() to anon, authenticated;

create or replace function public.sales_ip_allowed(p_ip inet)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.sales_allowed_ips)
      or exists (select 1 from public.sales_allowed_ips where p_ip <<= network);
$$;
revoke all on function public.sales_ip_allowed(inet) from public, anon, authenticated;

-- For the Vercel middleware (public key): only yes or no about one address.
create or replace function public.admin_ip_allowed(p_ip text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.sales_ip_allowed(p_ip::inet);
exception when others then
  return false;
end;
$$;
revoke all on function public.admin_ip_allowed(text) from public;
grant execute on function public.admin_ip_allowed(text) to anon, authenticated;

-- Every policy of the panel goes through here: an admin, from an allowed IP.
create or replace function public.is_sales_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sales_admins where user_id = auth.uid())
     and public.sales_ip_allowed(public.sales_request_ip());
$$;

-- Why the panel is (not) available, for its messages: 'ok', 'not_admin' or
-- 'ip_blocked', with the IP the API sees.
create or replace function public.sales_access()
returns table (status text, ip text) language sql stable security definer set search_path = public as $$
  select case
           when not exists (select 1 from public.sales_admins where user_id = auth.uid()) then 'not_admin'
           when not public.sales_ip_allowed(public.sales_request_ip()) then 'ip_blocked'
           else 'ok'
         end,
         host(public.sales_request_ip());
$$;
revoke all on function public.sales_access() from public, anon;
grant execute on function public.sales_access() to authenticated;

-- ── Managing the list from the panel ────────────────────────────────────────
create or replace function public.list_admin_ips()
returns table (id uuid, network text, label text, created_at timestamptz, includes_me boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.network::text, a.label, a.created_at,
         coalesce(public.sales_request_ip() <<= a.network, false)
    from public.sales_allowed_ips a
   where public.is_sales_admin()
   order by a.created_at;
$$;
revoke all on function public.list_admin_ips() from public, anon;
grant execute on function public.list_admin_ips() to authenticated;

create or replace function public.add_admin_ip(p_network text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_net cidr;
  v_me inet := public.sales_request_ip();
begin
  if not public.is_sales_admin() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  begin
    -- As a network: "83.45.120.7/24" becomes 83.45.120.0/24, a lone address /32 or /128.
    v_net := network(btrim(p_network)::inet);
  exception when others then
    raise exception 'Dirección no válida (p. ej. 83.45.120.7 o 83.45.120.0/24)' using errcode = 'invalid_parameter_value';
  end;
  if (family(v_net) = 4 and masklen(v_net) < 16) or (family(v_net) = 6 and masklen(v_net) < 48) then
    raise exception 'Rango demasiado amplio: como mucho /16 en IPv4 y /48 en IPv6' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.sales_allowed_ips)
     and v_me is not null and not coalesce(v_me <<= v_net, false) then
    raise exception 'La primera IP tiene que ser la tuya (%), o te quedarías fuera', host(v_me)
      using errcode = 'check_violation';
  end if;
  insert into public.sales_allowed_ips (network, label, created_by)
  values (v_net, nullif(btrim(p_label), ''), auth.uid())
  on conflict (network) do update set label = excluded.label;
end;
$$;
revoke all on function public.add_admin_ip(text, text) from public, anon;
grant execute on function public.add_admin_ip(text, text) to authenticated;

create or replace function public.remove_admin_ip(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me inet := public.sales_request_ip();
begin
  if not public.is_sales_admin() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  delete from public.sales_allowed_ips where id = p_id;
  -- Removing the last entry lifts the restriction; otherwise the caller must
  -- still be inside the list.
  if exists (select 1 from public.sales_allowed_ips)
     and not exists (select 1 from public.sales_allowed_ips where v_me <<= network) then
    raise exception 'Te quedarías fuera: esa es la IP desde la que estás conectado' using errcode = 'check_violation';
  end if;
end;
$$;
revoke all on function public.remove_admin_ip(uuid) from public, anon;
grant execute on function public.remove_admin_ip(uuid) to authenticated;
