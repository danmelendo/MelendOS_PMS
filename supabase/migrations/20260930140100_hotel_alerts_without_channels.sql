-- Channels are set up by Melend/OS support now (20260930140000), so a channel
-- refusing availability is no longer the hotel's to fix: it leaves the notice
-- in «Hoy» and the email to management. Support sees it in ops_alerts().
-- Notices already open for it close on the next hotel_alerts_scan().

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
  )
  select a.tenant_id, a.kind, a.items, a.oldest
    from a join public.tenants t on t.id = a.tenant_id
   where t.status in ('trial', 'active');
$$;
