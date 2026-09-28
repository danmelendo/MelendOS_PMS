-- What needs a person, across every hotel (for the platform, not the hotels):
-- sending queues that are stuck or failing, and the AI failing too often.
-- Read every hour by .github/workflows/ops-alerts.yml, which opens (or
-- updates, or closes) the "Alertas de operación" issue. Service role only.
create or replace function public.ops_alerts()
returns table (hotel text, source text, problem text, items bigint, oldest timestamptz)
language sql stable security definer set search_path = public as $$
  with a as (
    select tenant_id, 'SES.HOSPEDAJES' as source,
           case when status = 'pending' then 'en cola más de 30 min' else status end as problem,
           count(*) as items, min(created_at) as oldest
      from public.ses_communications
     where status in ('blocked', 'rejected', 'error')
        or (status = 'pending' and created_at < now() - interval '30 minutes')
     group by 1, 3
    union all
    select tenant_id, 'VERI*FACTU',
           case when status = 'pending' then 'en cola más de 30 min' else status end,
           count(*), min(created_at)
      from public.verifactu_records
     where status = 'rejected'
        or (status = 'pending' and created_at < now() - interval '30 minutes')
     group by 1, 3
    union all
    select tenant_id, 'Emails al huésped',
           case when status = 'pending' then 'en cola más de 30 min' else status end,
           count(*), min(created_at)
      from public.guest_emails
     where (status = 'failed' and created_at > now() - interval '7 days')
        or (status = 'pending' and created_at < now() - interval '30 minutes')
     group by 1, 3
    union all
    select tenant_id, 'Canales',
           case when status = 'pending' then 'en cola más de 30 min' else status end,
           count(*), min(created_at)
      from public.channel_outbox
     where (status = 'error' and created_at > now() - interval '7 days')
        or (status = 'pending' and created_at < now() - interval '30 minutes')
     group by 1, 3
    union all
    select tenant_id, 'Asistente IA', 'más del 20 % de turnos con error en 24 h',
           count(*) filter (where error is not null or outcome = 'error'), min(created_at)
      from public.agent_runs
     where created_at > now() - interval '24 hours' and channel <> 'eval'
     group by 1
    having count(*) >= 5
       and count(*) filter (where error is not null or outcome = 'error') > 0.2 * count(*)
  )
  select t.name, a.source, a.problem, a.items, a.oldest
    from a join public.tenants t on t.id = a.tenant_id
   where t.status in ('trial', 'active')
   order by a.oldest;
$$;
revoke execute on function public.ops_alerts() from public, anon, authenticated;
