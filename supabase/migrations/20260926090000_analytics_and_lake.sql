-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3: data for the dashboards, the data lake and (later) the ML models.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── When a booking was cancelled ─────────────────────────────────────────────
-- Needed for cancellation lead time and for "what was on the books on day X".
alter table public.reservations add column cancelled_at timestamptz;
update public.reservations set cancelled_at = updated_at where status = 'cancelled';

create or replace function public.stamp_cancellation()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'cancelled' then
    if tg_op = 'INSERT' or old.status is distinct from 'cancelled' then
      new.cancelled_at := coalesce(new.cancelled_at, now());
    end if;
  else
    new.cancelled_at := null; -- reinstated
  end if;
  return new;
end;
$$;
create trigger reservations_stamp_cancellation before insert or update of status on public.reservations
  for each row execute function public.stamp_cancellation();

-- ── Simulated history (demo) ─────────────────────────────────────────────────
-- Rows written by scripts/simulate-history.ts, so they can be told apart and
-- removed. Always false for real bookings.
alter table public.reservations add column simulated boolean not null default false;
alter table public.customers add column simulated boolean not null default false;

create index reservations_tenant_created_idx on public.reservations (tenant_id, created_at);

-- ── Stay facts for the dashboards ────────────────────────────────────────────
-- One compact row per stay that overlaps [p_from, p_to] or was booked in it,
-- with dates in each hotel's timezone. The KPI maths lives in
-- supabase/functions/_shared/domain/kpis.ts, shared with the demo mock.
-- Security invoker: row level security limits it to the caller's hotels.
-- Row layout: [tenant_id, room_id, check_in, check_out, created, cancelled,
--              status, channel, guests, room_revenue]
create or replace function public.report_stays(p_from date, p_to date, p_tenant uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with t as (
    select id, coalesce(settings->>'timezone', 'Europe/Madrid') as tz
    from public.tenants
    where public.is_tenant_member(id) and (p_tenant is null or id = p_tenant)
  ),
  s as (
    select r.tenant_id, r.room_id,
           (r.start_at at time zone t.tz)::date as check_in,
           (r.end_at at time zone t.tz)::date as check_out,
           (r.created_at at time zone t.tz)::date as created,
           (r.cancelled_at at time zone t.tz)::date as cancelled,
           r.status, r.created_by_role as channel, r.people,
           r.base_price + r.dynamic_surcharge - r.discount_amount as room_revenue
    from public.reservations r join t on t.id = r.tenant_id
    -- Coarse filter with a day of margin (index friendly); exact one below.
    where (r.start_at < (p_to + 2)::timestamp at time zone t.tz
           and r.end_at > (p_from - 1)::timestamp at time zone t.tz)
       or (r.created_at >= (p_from - 1)::timestamp at time zone t.tz
           and r.created_at < (p_to + 2)::timestamp at time zone t.tz)
  )
  select jsonb_build_object(
    'rooms', coalesce((
      select jsonb_object_agg(ro.tenant_id, ro.n)
      from (select tenant_id, count(*) as n from public.rooms
            where active and tenant_id in (select id from t) group by tenant_id) ro
    ), '{}'::jsonb),
    'stays', coalesce((
      select jsonb_agg(jsonb_build_array(tenant_id, room_id, check_in, check_out, created, cancelled,
                                         status, channel, people, room_revenue))
      from s
      where (check_in <= p_to and check_out > p_from) or created between p_from and p_to
    ), '[]'::jsonb)
  );
$$;
revoke execute on function public.report_stays(date, date, uuid) from public, anon;
grant execute on function public.report_stays(date, date, uuid) to authenticated;

-- ── Data lake bucket ─────────────────────────────────────────────────────────
-- Private: written by the export job with the secret key, never by clients.
-- Layout: tenant=<id>/<table>/dt=<yyyy-mm-dd>/<table>.parquet (see lake/README.md)
insert into storage.buckets (id, name, public, file_size_limit)
values ('lake', 'lake', false, 104857600)
on conflict (id) do nothing;

-- Storage used per hotel, for the SaaS costs passed on to each client.
create or replace function public.tenant_storage_usage()
returns table (tenant_id uuid, objects bigint, bytes bigint)
language sql stable security definer set search_path = public, storage as $$
  select t.id, count(o.id), coalesce(sum((o.metadata->>'size')::bigint), 0)
  from public.tenants t
  left join storage.objects o
    on o.bucket_id = 'lake' and o.name like 'tenant=' || t.id::text || '/%'
  where public.has_tenant_role(t.id, 'admin')
  group by t.id;
$$;
revoke execute on function public.tenant_storage_usage() from public, anon;
grant execute on function public.tenant_storage_usage() to authenticated;
revoke execute on function public.stamp_cancellation() from public, anon, authenticated;
