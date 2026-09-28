-- What the hotel itself has to fix, for the notice at the top of "Hoy": the
-- part of ops_alerts() that needs someone at the hotel (missing traveller
-- data, an invoice the AEAT rejected, a guest email that bounced, a channel
-- refusing updates). Slow queues and the AI failing are the platform's job
-- and stay in ops_alerts() only. Staff of the hotel only; the panel words
-- each kind.
drop function if exists public.hotel_alerts();
create function public.hotel_alerts()
returns table (tenant_id uuid, hotel text, kind text, items bigint, oldest timestamptz)
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
  select a.tenant_id, t.name, a.kind, a.items, a.oldest
    from a join public.tenants t on t.id = a.tenant_id
   where t.status in ('trial', 'active')
     and public.is_tenant_staff(a.tenant_id)
   order by a.oldest;
$$;
revoke execute on function public.hotel_alerts() from public, anon;
grant execute on function public.hotel_alerts() to authenticated;
