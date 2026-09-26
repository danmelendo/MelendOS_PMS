-- ─────────────────────────────────────────────────────────────────────────────
-- Packages and modules. The product is sold as a base every hotel gets plus
-- optional packages (stay, ai, chain, data), each a set of modules. A hotel's
-- packages are tenants.settings.packages, or its plan's defaults; single
-- modules can still be overridden in settings.features.
-- Same rules in TS: supabase/functions/_shared/domain/features.ts (catalogue).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.module_package(p_feature text)
returns text language sql immutable set search_path = public as $$
  select case p_feature
    when 'chat' then 'stay' when 'folio' then 'stay'
    when 'reviews' then 'stay' when 'experiences' then 'stay'
    when 'ai_agent' then 'ai' when 'mcp' then 'ai'
    when 'loyalty' then 'chain'
    when 'reports' then 'data' when 'data_lake' then 'data'
  end;
$$;

create or replace function public.tenant_packages(p_plan text, p_settings jsonb)
returns text[] language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(p_settings->'packages') = 'array' then
      array(select p from jsonb_array_elements_text(p_settings->'packages') p
             where p in ('stay', 'ai', 'chain', 'data'))
    when p_plan in ('pro', 'group') then array['stay', 'ai', 'chain', 'data']
    else array['stay']
  end;
$$;

-- Only boolean overrides count (a stray "no" must not break every check).
create or replace function public.tenant_feature(p_tenant uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    case when jsonb_typeof(t.settings->'features'->p_feature) = 'boolean'
         then (t.settings->'features'->>p_feature)::boolean end,
    public.module_package(p_feature) = any(public.tenant_packages(t.plan, t.settings)),
    false)
  from public.tenants t where t.id = p_tenant;
$$;

-- ── Server checks for the modules added with the catalogue ─────────────────
-- Reports: only hotels with the module.
create or replace function public.report_stays(p_from date, p_to date, p_tenant uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with t as (
    select id, coalesce(settings->>'timezone', 'Europe/Madrid') as tz
    from public.tenants
    where public.is_tenant_member(id) and (p_tenant is null or id = p_tenant)
      and public.tenant_feature(id, 'reports')
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

-- MCP: tokens only for hotels with the module, and they stop working without it.
create or replace function public.create_mcp_token(
  p_tenant uuid, p_name text, p_scopes text[], p_days integer default 90)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_scopes text[] := case when 'write' = any(coalesce(p_scopes, '{}')) then array['read', 'write']
                          else array['read'] end;
  v_token text;
  v_row public.mcp_tokens%rowtype;
begin
  if not public.has_tenant_role(p_tenant, 'admin') then
    raise exception 'Solo un administrador del hotel puede crear accesos' using errcode = 'insufficient_privilege';
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

create or replace function public.mcp_token_auth(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.mcp_tokens%rowtype;
begin
  select t.* into v_row
    from public.mcp_tokens t
    join public.tenants te on te.id = t.tenant_id
   where t.token_hash = p_token_hash
     and t.revoked_at is null
     and t.expires_at > now()
     and te.status in ('trial', 'active')
     and public.tenant_feature(t.tenant_id, 'mcp');
  if not found then
    return null;
  end if;
  if v_row.last_used_at is null or v_row.last_used_at < now() - interval '1 minute' then
    update public.mcp_tokens set last_used_at = now() where id = v_row.id;
  end if;
  return jsonb_build_object(
    'token_id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'scopes', v_row.scopes,
    'calls_last_minute', (
      select count(*) from public.usage_events u
       where u.tenant_id = v_row.tenant_id
         and u.metric = 'mcp.tool_call'
         and u.occurred_at > now() - interval '1 minute'
         and u.metadata->>'token_id' = v_row.id::text));
end;
$$;

-- Hotels whose data goes to the data lake (the export job reads this).
create or replace function public.lake_tenants()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.tenants
   where status in ('trial', 'active') and public.tenant_feature(id, 'data_lake')
   order by id;
$$;

revoke execute on function public.lake_tenants() from public, anon, authenticated;
grant execute on function public.module_package(text) to anon, authenticated;
grant execute on function public.tenant_packages(text, jsonb) to anon, authenticated;
