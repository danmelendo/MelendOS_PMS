-- Email to a hotel's management when something only the hotel can fix shows
-- up (the same list as the notice in "Hoy"). hotel_alerts_scan() runs every
-- 15 minutes: it opens a notice when an alert appears and closes it when it is
-- gone, so each problem is emailed once per episode, not every minute. The
-- emails go out with guest-emails-dispatch (same cron, key and provider).

-- Every hotel's alerts, for the platform (service role and the scan).
create or replace function public.hotel_alerts_all()
returns table (tenant_id uuid, kind text, items bigint, oldest timestamptz)
language sql stable security definer set search_path = public as $$
  with a as (
    select s.tenant_id, 'ses_' || s.status as kind, count(*) as items, min(s.created_at) as oldest
      from public.ses_communications s
     where s.status in ('blocked', 'rejected', 'error')
     group by 1, 2
    union all
    select v.tenant_id, 'verifactu_rejected', count(*), min(v.created_at)
      from public.verifactu_records v
     where v.status = 'rejected'
     group by 1
    union all
    select g.tenant_id, 'email_failed', count(*), min(g.created_at)
      from public.guest_emails g
     where g.status = 'failed' and g.created_at > now() - interval '7 days'
     group by 1
    union all
    select c.tenant_id, 'channel_error', count(*), min(c.created_at)
      from public.channel_outbox c
     where c.status = 'error' and c.created_at > now() - interval '7 days'
     group by 1
  )
  select a.tenant_id, a.kind, a.items, a.oldest
    from a join public.tenants t on t.id = a.tenant_id
   where t.status in ('trial', 'active');
$$;
revoke execute on function public.hotel_alerts_all() from public, anon, authenticated;

-- The panel's view: the same, only for the caller's hotels.
create or replace function public.hotel_alerts()
returns table (tenant_id uuid, hotel text, kind text, items bigint, oldest timestamptz)
language sql stable security definer set search_path = public as $$
  select a.tenant_id, t.name, a.kind, a.items, a.oldest
    from public.hotel_alerts_all() a
    join public.tenants t on t.id = a.tenant_id
   where public.is_tenant_staff(a.tenant_id)
   order by a.oldest;
$$;

create table public.hotel_alert_notices (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  kind        text not null,
  items       bigint not null,
  opened_at   timestamptz not null default now(),
  resolved_at timestamptz,
  status      text not null default 'pending'
                check (status in ('pending', 'sent', 'simulated', 'skipped', 'failed')),
  notified_at timestamptz,
  attempts    integer not null default 0,
  error       text
);
-- One open notice per hotel and kind.
create unique index hotel_alert_notices_open_idx
  on public.hotel_alert_notices (tenant_id, kind) where resolved_at is null;
alter table public.hotel_alert_notices enable row level security;
revoke all on public.hotel_alert_notices from anon, authenticated;

-- Opens notices for new alerts, keeps the count of open ones and closes the
-- ones that went away (a notice resolved before it was emailed is skipped).
create or replace function public.hotel_alerts_scan()
returns integer language plpgsql security definer set search_path = public as $$
declare v_opened integer;
begin
  create temporary table if not exists _alerts on commit drop as
    select * from public.hotel_alerts_all() limit 0;
  truncate _alerts;
  insert into _alerts select * from public.hotel_alerts_all();

  update public.hotel_alert_notices n
     set resolved_at = now(),
         status = case when n.status = 'pending' then 'skipped' else n.status end
   where n.resolved_at is null
     and not exists (select 1 from _alerts a where a.tenant_id = n.tenant_id and a.kind = n.kind);

  update public.hotel_alert_notices n
     set items = a.items
    from _alerts a
   where n.resolved_at is null and a.tenant_id = n.tenant_id and a.kind = n.kind
     and n.items is distinct from a.items;

  insert into public.hotel_alert_notices (tenant_id, kind, items)
  select a.tenant_id, a.kind, a.items from _alerts a
   where not exists (select 1 from public.hotel_alert_notices n
                      where n.tenant_id = a.tenant_id and n.kind = a.kind and n.resolved_at is null);
  get diagnostics v_opened = row_count;
  return v_opened;
end;
$$;
revoke execute on function public.hotel_alerts_scan() from public, anon, authenticated;

-- Who gets the email: the hotel's management and group management.
create or replace function public.hotel_alert_recipients(p_tenant uuid)
returns table (email text) language sql stable security definer set search_path = public as $$
  select distinct u.email::text
    from public.tenant_members m
    join auth.users u on u.id = m.user_id
   where m.tenant_id = p_tenant and m.role in ('admin', 'group') and u.email is not null;
$$;
revoke execute on function public.hotel_alert_recipients(uuid) from public, anon, authenticated;

create or replace function public.mark_hotel_alert_notices(
  p_ids uuid[], p_status text, p_error text, p_attempt boolean)
returns void language sql security definer set search_path = public as $$
  update public.hotel_alert_notices
     set status = p_status,
         error = p_error,
         attempts = attempts + case when p_attempt then 1 else 0 end,
         notified_at = case when p_status in ('sent', 'simulated') then now() else notified_at end
   where id = any(p_ids);
$$;
revoke execute on function public.mark_hotel_alert_notices(uuid[], text, text, boolean) from public, anon, authenticated;

-- The email dispatcher also wakes up for pending notices.
create or replace function public.guest_emails_tick()
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_url text; v_key text;
begin
  if not exists (select 1 from public.guest_emails where status = 'pending')
     and not exists (select 1 from public.hotel_alert_notices where status = 'pending' and resolved_at is null) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'guest-emails/cron_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'guest-emails/cron_key';
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
revoke execute on function public.guest_emails_tick() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('hotel-alerts-scan', '*/15 * * * *', $cron$ select public.hotel_alerts_scan(); $cron$);
exception when others then
  raise notice 'pg_cron not available: hotel alerts not scanned (%)', sqlerrm;
end $$;
