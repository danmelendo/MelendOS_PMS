-- Fixes from the pentest of 29/09/2026 (docs/pentest-2026-09.md).
--
-- 1. Abuse limits per client IP for what anyone can call: a fixed window per
--    key (rate_limit_hit), used by the Edge Functions (bookings, payments, the
--    assistant) and inside the guest lookup and the promo code check.
--    The IP is Cloudflare's cf-connecting-ip, which the client cannot forge
--    (X-Forwarded-For can); calls with the service key are not limited here.
-- 2. folio_balance() was executable by any signed-in user (a bill's balance
--    from a booking id): now only the server and the functions that use it.

create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         integer not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- One more hit for `p_key`; false once it passes p_max in the window.
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;

-- The browser's IP in an API call (Cloudflare header); null for the service
-- key (the server calling on behalf of many users) and outside the API.
create or replace function public.request_ip()
returns text language plpgsql stable set search_path = public as $$
declare h json;
begin
  if coalesce(auth.jwt()->>'role', '') = 'service_role' then
    return null;
  end if;
  h := nullif(current_setting('request.headers', true), '')::json;
  return nullif(btrim(h->>'cf-connecting-ip'), '');
exception when others then
  return null;
end;
$$;

-- Expired windows go away every night.
do $$
begin
  perform cron.schedule('rate-limits-cleanup', '40 3 * * *',
    $cron$ delete from public.rate_limits where window_start < now() - interval '1 day' $cron$);
exception when others then
  raise notice 'pg_cron not available: rate limits not cleaned (%)', sqlerrm;
end $$;

-- Guest lookup (reference + email): 10 tries per IP every 15 minutes.
create or replace function public.find_guest_booking(p_tenant uuid, p_reference text, p_email text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ids uuid[];
  v_token text;
  v_ip text := public.request_ip();
begin
  if coalesce(btrim(p_reference), '') = '' or coalesce(btrim(p_email), '') = '' then
    return null;
  end if;
  if v_ip is not null and not public.rate_limit_hit('find-booking:' || v_ip, 10, 900) then
    raise exception 'Demasiados intentos; prueba de nuevo en unos minutos' using errcode = 'P0001';
  end if;
  select array_agg(r.id) into v_ids
    from public.reservations r
    left join public.customers c on c.id = r.customer_id
    left join public.members m on m.id = r.member_id
   where r.tenant_id = p_tenant
     and r.reference = upper(btrim(p_reference))
     and lower(coalesce(m.email, c.email)) = lower(btrim(p_email))
     and r.status not in ('rejected');
  if coalesce(array_length(v_ids, 1), 0) <> 1 then
    return null;
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.booking_access_tokens (tenant_id, reservation_id, token_hash)
  values (p_tenant, v_ids[1], encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return jsonb_build_object('id', v_ids[1], 'token', v_token);
end;
$$;

-- Promo codes from the browser: 30 checks per IP an hour (no guessing unpublished
-- codes by trying words). Now volatile, since it records the attempt.
create or replace function public.validate_promo_code(p_tenant uuid, p_code text)
returns table(id uuid, code text, discount_type text, discount_value numeric)
language plpgsql volatile security definer set search_path = public as $$
declare v_ip text := public.request_ip();
begin
  if v_ip is not null and not public.rate_limit_hit('promo:' || v_ip, 30, 3600) then
    return;
  end if;
  return query
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
end;
$$;

-- Only the server (payments-create) and the SQL functions that use it.
revoke execute on function public.folio_balance(uuid) from public, anon, authenticated;
