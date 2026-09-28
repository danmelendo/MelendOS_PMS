-- Activity and consumption of a hotel (Admin → Actividad): what the AI used
-- (turns, tokens, cost, latency, errors), MCP calls, the state of the sending
-- queues (SES.HOSPEDAJES, VERI*FACTU, guest emails, channels), storage, and
-- the latest errors. For the hotel's management and for us: it is what a
-- support call needs first, and the base of billing by consumption.
create or replace function public.hotel_activity(p_tenant uuid, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public, storage as $$
declare v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  if not public.has_tenant_role(p_tenant, 'admin') then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'since', v_since,
    'ai', coalesce((
      select jsonb_agg(jsonb_build_object(
               'channel', channel, 'turns', turns, 'input_tokens', input_tokens,
               'output_tokens', output_tokens, 'cost_usd', cost_usd, 'p50_ms', p50_ms,
               'p95_ms', p95_ms, 'errors', errors) order by turns desc)
        from (
          select channel, count(*) as turns, sum(input_tokens) as input_tokens,
                 sum(output_tokens) as output_tokens, round(sum(cost_usd)::numeric, 4) as cost_usd,
                 round(percentile_cont(0.5) within group (order by latency_ms))::int as p50_ms,
                 round(percentile_cont(0.95) within group (order by latency_ms))::int as p95_ms,
                 count(*) filter (where error is not null or outcome = 'error') as errors
            from public.agent_runs
           where tenant_id = p_tenant and created_at >= v_since
           group by channel) a), '[]'::jsonb),
    'mcp_calls', (select coalesce(sum(quantity), 0) from public.usage_events
                   where tenant_id = p_tenant and metric = 'mcp.tool_call' and occurred_at >= v_since),
    'queues', jsonb_build_object(
      'ses', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
                select status, count(*) as n from public.ses_communications
                 where tenant_id = p_tenant and (created_at >= v_since or status not in ('accepted', 'cancelled', 'skipped'))
                 group by status) s),
      'verifactu', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
                select status, count(*) as n from public.verifactu_records
                 where tenant_id = p_tenant and (created_at >= v_since or status <> 'accepted')
                 group by status) s),
      'emails', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
                select status, count(*) as n from public.guest_emails
                 where tenant_id = p_tenant and created_at >= v_since
                 group by status) s),
      'channels', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
                select status, count(*) as n from public.channel_outbox
                 where tenant_id = p_tenant and created_at >= v_since
                 group by status) s)),
    'storage', jsonb_build_object(
      'lake_bytes', (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o
                      where o.bucket_id = 'lake' and o.name like 'tenant=' || p_tenant::text || '/%'),
      'media_bytes', (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o
                       where o.bucket_id = 'hotel-media' and o.name like p_tenant::text || '/%')),
    'errors', coalesce((
      select jsonb_agg(e order by e->>'at' desc) from (
        select jsonb_build_object('source', source, 'at', at, 'message', left(message, 300)) as e
          from (
            (select 'asistente' as source, created_at as at, error as message from public.agent_runs
              where tenant_id = p_tenant and error is not null and created_at >= v_since
              order by created_at desc limit 10)
            union all
            (select 'SES.HOSPEDAJES', updated_at, error from public.ses_communications
              where tenant_id = p_tenant and error is not null and status in ('blocked', 'rejected', 'error')
              order by updated_at desc limit 10)
            union all
            (select 'VERI*FACTU', created_at, error from public.verifactu_records
              where tenant_id = p_tenant and error is not null and status <> 'accepted'
              order by created_at desc limit 10)
            union all
            (select 'email al huésped', created_at, error from public.guest_emails
              where tenant_id = p_tenant and status = 'failed' and created_at >= v_since
              order by created_at desc limit 10)
            union all
            (select 'canales', created_at, error from public.channel_outbox
              where tenant_id = p_tenant and error is not null and created_at >= v_since
              order by created_at desc limit 10)
          ) x
         order by at desc limit 15) y), '[]'::jsonb));
end;
$$;
revoke execute on function public.hotel_activity(uuid, integer) from public, anon;
grant execute on function public.hotel_activity(uuid, integer) to authenticated;
