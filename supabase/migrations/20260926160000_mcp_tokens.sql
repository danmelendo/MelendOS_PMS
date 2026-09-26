-- ─────────────────────────────────────────────────────────────────────────────
-- MCP server access: tokens per hotel with scopes. 'read' exposes the
-- read-only tools (availability, prices, room details, booking lookup);
-- 'write' adds the ones that create something (booking drafts, payment links,
-- cancellation requests). None of them is irreversible.
--
-- The plain token is shown once, when it is created; only its SHA-256 is
-- stored. The table has no policies: the mcp Edge Function (service role)
-- checks tokens with mcp_token_auth(), and admins manage them through the
-- functions below, which never return the hash.
-- Every tool call is metered in usage_events (metric 'mcp.tool_call').
-- ─────────────────────────────────────────────────────────────────────────────

create table public.mcp_tokens (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  token_prefix  text not null,
  token_hash    text not null unique,
  scopes        text[] not null
                check (scopes <@ array['read', 'write']::text[] and 'read' = any(scopes)),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index mcp_tokens_tenant_idx on public.mcp_tokens (tenant_id, created_at desc);
alter table public.mcp_tokens enable row level security;
revoke all on public.mcp_tokens from anon, authenticated;

-- ── Admins ───────────────────────────────────────────────────────────────────
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
  if not public.has_tenant_role(p_tenant, 'admin') then
    raise exception 'Solo un administrador del hotel puede ver los accesos' using errcode = 'insufficient_privilege';
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
  if not found or not public.has_tenant_role(v_row.tenant_id, 'admin') then
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

-- ── The MCP server (service role only) ──────────────────────────────────────
-- Checks a token (by its hash) and returns its hotel, scopes and how many tool
-- calls it made in the last minute (rate limit). Null when the token is
-- unknown, revoked, expired or its hotel is not active.
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
     and te.status in ('trial', 'active');
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

revoke execute on function public.create_mcp_token(uuid, text, text[], integer) from public, anon;
revoke execute on function public.list_mcp_tokens(uuid) from public, anon;
revoke execute on function public.revoke_mcp_token(uuid) from public, anon;
grant execute on function public.create_mcp_token(uuid, text, text[], integer) to authenticated;
grant execute on function public.list_mcp_tokens(uuid) to authenticated;
grant execute on function public.revoke_mcp_token(uuid) to authenticated;
revoke execute on function public.mcp_token_auth(text) from public, anon, authenticated;
grant execute on function public.mcp_token_auth(text) to service_role;
