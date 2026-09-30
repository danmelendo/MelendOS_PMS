-- What Melend/OS sets up for a hotel, closed in the database too (30/09/2026,
-- Dan: "bloquéalo en SQL también"). The panel already showed these sections only
-- to the support role («Administrador», staff_role 'platform'); now the
-- database refuses them to everyone else, hotel management included:
--
-- - channels: connect, change and remove (staff still read the channel names:
--   the bookings list shows where each booking came from); their message log
--   and outbox;
-- - AI integrations (MCP access keys);
-- - the booking journal (written by server functions only);
-- - activity and usage (hotel_activity).
--
-- Plan and modules, channel dispatch and the demo simulator are Edge Functions,
-- guarded in their own code. has_tenant_role(t, 'platform') is true only for the
-- support role (group management counts as 'admin', not as 'platform').

-- Channels: staff read the names; only support manages them.
drop policy if exists channels_admin_update on public.channels;
drop policy if exists channels_admin_delete on public.channels;
create policy channels_platform_update on public.channels
  for update to authenticated
  using (public.has_tenant_role(tenant_id, 'platform'))
  with check (public.has_tenant_role(tenant_id, 'platform'));
create policy channels_platform_delete on public.channels
  for delete to authenticated using (public.has_tenant_role(tenant_id, 'platform'));

drop policy if exists channel_messages_staff_read on public.channel_messages;
create policy channel_messages_platform_read on public.channel_messages
  for select to authenticated using (public.has_tenant_role(tenant_id, 'platform'));
drop policy if exists channel_outbox_staff_read on public.channel_outbox;
create policy channel_outbox_platform_read on public.channel_outbox
  for select to authenticated using (public.has_tenant_role(tenant_id, 'platform'));

-- Booking journal: read by support only; rows come from security definer
-- functions and triggers, never from the client.
drop policy if exists booking_journal_staff_all on public.booking_journal;
create policy booking_journal_platform_read on public.booking_journal
  for select to authenticated using (public.has_tenant_role(tenant_id, 'platform'));

create or replace function public.create_channel(
  p_tenant uuid, p_kind text, p_provider text, p_name text,
  p_commission numeric default 0, p_room_map jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_id uuid;
  v_secret text := 'dsc_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not public.has_tenant_role(p_tenant, 'platform') then
    raise exception 'Los canales los configura el soporte de Melend/OS' using errcode = 'insufficient_privilege';
  end if;
  if not public.tenant_feature(p_tenant, 'channels') then
    raise exception 'El hotel no tiene contratado el paquete de distribución' using errcode = 'check_violation';
  end if;
  insert into public.channels (tenant_id, kind, provider, name, commission_pct, room_map)
  values (p_tenant, p_kind, p_provider, btrim(p_name), coalesce(p_commission, 0),
          coalesce(p_room_map, '{}'::jsonb))
  returning id into v_id;
  perform vault.create_secret(v_secret, 'channels/' || v_id::text, 'Channel signing secret');
  insert into public.domain_events (tenant_id, event_type, entity, entity_id, actor_id, payload)
  values (p_tenant, 'channel.created', 'channel', v_id, auth.uid(),
          jsonb_build_object('provider', p_provider, 'kind', p_kind));
  return jsonb_build_object('id', v_id, 'secret', v_secret);
end;
$$;

create or replace function public.delete_channel(p_channel uuid)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.channels where id = p_channel;
  if v_tenant is null or not public.has_tenant_role(v_tenant, 'platform') then
    raise exception 'Canal no encontrado' using errcode = 'no_data_found';
  end if;
  delete from vault.secrets where name = 'channels/' || p_channel::text;
  delete from public.channels where id = p_channel;
  insert into public.domain_events (tenant_id, event_type, entity, entity_id, actor_id, payload)
  values (v_tenant, 'channel.deleted', 'channel', p_channel, auth.uid(), '{}'::jsonb);
end;
$$;

create or replace function public.create_mcp_token(
  p_tenant uuid, p_name text, p_scopes text[], p_days integer default 90)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_scopes text[] := case when 'write' = any(coalesce(p_scopes, '{}')) then array['read', 'write']
                          else array['read'] end;
  v_token text;
  v_row public.mcp_tokens%rowtype;
begin
  if not public.has_tenant_role(p_tenant, 'platform') then
    raise exception 'Las integraciones IA las configura el soporte de Melend/OS' using errcode = 'insufficient_privilege';
  end if;
  if not public.tenant_feature(p_tenant, 'mcp') then
    raise exception 'El hotel no tiene contratado el módulo de integraciones IA' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_name), '') = '' or char_length(btrim(p_name)) > 80 then
    raise exception 'Pon un nombre de hasta 80 caracteres' using errcode = 'check_violation';
  end if;
  if p_days is null or p_days not between 1 and 365 then
    raise exception 'La caducidad debe estar entre 1 y 365 días' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.mcp_tokens
       where tenant_id = p_tenant and revoked_at is null and expires_at > now()) >= 20 then
    raise exception 'Máximo 20 accesos activos por hotel: revoca alguno' using errcode = 'check_violation';
  end if;

  v_token := 'dsm_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.mcp_tokens (tenant_id, name, token_prefix, token_hash, scopes, created_by, expires_at)
  values (p_tenant, btrim(p_name), left(v_token, 12), encode(extensions.digest(v_token, 'sha256'), 'hex'),
          v_scopes, auth.uid(), now() + make_interval(days => p_days))
  returning * into v_row;

  insert into public.domain_events (tenant_id, event_type, entity, entity_id, actor_id, payload)
  values (p_tenant, 'mcp_token.created', 'mcp_token', v_row.id, auth.uid(),
          jsonb_build_object('name', v_row.name, 'scopes', v_row.scopes, 'expires_at', v_row.expires_at));

  return jsonb_build_object(
    'id', v_row.id,
    'token', v_token,
    'token_prefix', v_row.token_prefix,
    'scopes', v_row.scopes,
    'expires_at', v_row.expires_at);
end;
$$;

create or replace function public.list_mcp_tokens(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_tenant_role(p_tenant, 'platform') then
    raise exception 'Las integraciones IA las configura el soporte de Melend/OS' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id,
             'name', t.name,
             'token_prefix', t.token_prefix,
             'scopes', t.scopes,
             'created_at', t.created_at,
             'expires_at', t.expires_at,
             'last_used_at', t.last_used_at,
             'revoked_at', t.revoked_at,
             'calls_30d', (
               select count(*) from public.usage_events u
                where u.tenant_id = t.tenant_id
                  and u.metric = 'mcp.tool_call'
                  and u.occurred_at > now() - interval '30 days'
                  and u.metadata->>'token_id' = t.id::text))
           order by t.revoked_at is not null, t.created_at desc)
      from public.mcp_tokens t
     where t.tenant_id = p_tenant), '[]'::jsonb);
end;
$$;

create or replace function public.revoke_mcp_token(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.mcp_tokens%rowtype;
begin
  select * into v_row from public.mcp_tokens where id = p_id for update;
  if not found or not public.has_tenant_role(v_row.tenant_id, 'platform') then
    raise exception 'Acceso no encontrado' using errcode = 'no_data_found';
  end if;
  if v_row.revoked_at is null then
    update public.mcp_tokens set revoked_at = now() where id = p_id;
    insert into public.domain_events (tenant_id, event_type, entity, entity_id, actor_id, payload)
    values (v_row.tenant_id, 'mcp_token.revoked', 'mcp_token', v_row.id, auth.uid(),
            jsonb_build_object('name', v_row.name));
  end if;
end;
$$;

create or replace function public.hotel_activity(p_tenant uuid, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public, storage as $$
declare v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  if not public.has_tenant_role(p_tenant, 'platform') then
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
