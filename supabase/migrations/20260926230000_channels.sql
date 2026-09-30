-- ─────────────────────────────────────────────────────────────────────────────
-- Distribution channels: OTAs, channel managers and tour operators. Provider
-- neutral (contract in docs/channels.md and _shared/channels/): bookings come
-- in through the channel-webhook function, signed with the channel's secret;
-- availability goes out through channel_outbox and channels-dispatch.
-- New package "distribution" with the module "channels".
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Package and module (same rules in @domain/features.ts) ──────────────────
create or replace function public.module_package(p_feature text)
returns text language sql immutable set search_path = public as $$
  select case p_feature
    when 'chat' then 'stay' when 'folio' then 'stay'
    when 'reviews' then 'stay' when 'experiences' then 'stay'
    when 'ai_agent' then 'ai' when 'mcp' then 'ai' when 'copilot' then 'ai'
    when 'loyalty' then 'chain'
    when 'reports' then 'data' when 'data_lake' then 'data'
    when 'channels' then 'distribution'
  end;
$$;

create or replace function public.tenant_packages(p_plan text, p_settings jsonb)
returns text[] language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(p_settings->'packages') = 'array' then
      array(select p from jsonb_array_elements_text(p_settings->'packages') p
             where p in ('stay', 'ai', 'chain', 'data', 'distribution'))
    when p_plan in ('pro', 'group') then array['stay', 'ai', 'chain', 'data', 'distribution']
    else array['stay']
  end;
$$;

-- ── Channels ─────────────────────────────────────────────────────────────────
create table public.channels (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  kind             text not null check (kind in ('ota', 'tour_operator', 'channel_manager')),
  provider         text not null check (provider in ('booking_com', 'expedia', 'airbnb', 'hotelbeds',
                                                     'siteminder', 'channex', 'demo', 'other')),
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  status           text not null default 'active' check (status in ('active', 'paused')),
  commission_pct   numeric(5,2) not null default 0 check (commission_pct between 0 and 60),
  -- Channel room type code → rate_groups.id of the hotel.
  room_map         jsonb not null default '{}'::jsonb check (jsonb_typeof(room_map) = 'object'),
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz,
  unique (tenant_id, id)
);
alter table public.channels enable row level security;
create policy channels_staff_read on public.channels
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy channels_admin_update on public.channels
  for update to authenticated
  using (public.has_tenant_role(tenant_id, 'admin'))
  with check (public.has_tenant_role(tenant_id, 'admin'));
create policy channels_admin_delete on public.channels
  for delete to authenticated using (public.has_tenant_role(tenant_id, 'admin'));

-- What came in and went out, for the follow-up in the panel.
create table public.channel_messages (
  id              bigint generated always as identity primary key,
  tenant_id       uuid not null,
  channel_id      uuid not null,
  direction       text not null check (direction in ('in', 'out')),
  event           text not null,
  external_ref    text,
  reservation_id  uuid,
  status          text not null check (status in ('ok', 'error')),
  detail          text,
  payload         jsonb,
  created_at      timestamptz not null default now(),
  foreign key (tenant_id, channel_id) references public.channels (tenant_id, id) on delete cascade
);
create index channel_messages_channel_idx on public.channel_messages (channel_id, created_at desc);
alter table public.channel_messages enable row level security;
create policy channel_messages_staff_read on public.channel_messages
  for select to authenticated using (public.is_tenant_member(tenant_id));

-- Availability changes waiting to be sent to each channel.
create table public.channel_outbox (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null,
  channel_id  uuid not null,
  event       text not null default 'ari.availability',
  payload     jsonb not null,
  status      text not null default 'pending' check (status in ('pending', 'sent', 'error')),
  attempts    integer not null default 0,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  error       text,
  foreign key (tenant_id, channel_id) references public.channels (tenant_id, id) on delete cascade
);
create index channel_outbox_pending_idx on public.channel_outbox (tenant_id, status, created_at);
alter table public.channel_outbox enable row level security;
create policy channel_outbox_staff_read on public.channel_outbox
  for select to authenticated using (public.is_tenant_member(tenant_id));

-- Bookings from a channel: which one, its booking id and the commission.
alter table public.reservations
  add column channel_id uuid,
  add column external_ref text,
  add column channel_commission numeric(10,2),
  add constraint reservations_channel_fk foreign key (tenant_id, channel_id)
    references public.channels (tenant_id, id) on delete set null (channel_id);
create unique index reservations_channel_ref_idx
  on public.reservations (channel_id, external_ref) where channel_id is not null;

-- ── Secrets and set-up ───────────────────────────────────────────────────────
-- Admins add a channel; the signing secret is shown once and kept in Vault.
create or replace function public.create_channel(
  p_tenant uuid, p_kind text, p_provider text, p_name text,
  p_commission numeric default 0, p_room_map jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_id uuid;
  v_secret text := 'dsc_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not public.has_tenant_role(p_tenant, 'admin') then
    raise exception 'Solo dirección puede conectar canales' using errcode = 'insufficient_privilege';
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

-- The signing secret of a channel (channel-webhook, service role only).
create or replace function public.channel_secret(p_channel uuid)
returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'channels/' || p_channel::text limit 1;
$$;

-- Removes a channel and its signing secret (its bookings stay, unlinked).
create or replace function public.delete_channel(p_channel uuid)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.channels where id = p_channel;
  if v_tenant is null or not public.has_tenant_role(v_tenant, 'admin') then
    raise exception 'Canal no encontrado' using errcode = 'no_data_found';
  end if;
  delete from vault.secrets where name = 'channels/' || p_channel::text;
  delete from public.channels where id = p_channel;
  insert into public.domain_events (tenant_id, event_type, entity, entity_id, actor_id, payload)
  values (v_tenant, 'channel.deleted', 'channel', p_channel, auth.uid(), '{}'::jsonb);
end;
$$;
revoke execute on function public.delete_channel(uuid) from public, anon;
grant execute on function public.delete_channel(uuid) to authenticated;

-- ── Availability changes → outbox of every active channel ───────────────────
create or replace function public.queue_channel_availability()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := coalesce(new.tenant_id, old.tenant_id);
  v_from timestamptz := least(coalesce(new.start_at, old.start_at), coalesce(old.start_at, new.start_at));
  v_to timestamptz := greatest(coalesce(new.end_at, old.end_at), coalesce(old.end_at, new.end_at));
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.start_at = old.start_at and new.end_at = old.end_at
     and new.room_id = old.room_id then
    return new;
  end if;
  insert into public.channel_outbox (tenant_id, channel_id, payload)
  select c.tenant_id, c.id,
         jsonb_build_object('from', (v_from at time zone 'UTC')::date,
                            'to', (v_to at time zone 'UTC')::date + 1,
                            'reservation_id', coalesce(new.id, old.id))
    from public.channels c
   where c.tenant_id = v_tenant and c.status = 'active'
     and public.tenant_feature(v_tenant, 'channels');
  return coalesce(new, old);
end;
$$;
create trigger reservations_channel_availability
  after insert or update or delete on public.reservations
  for each row execute function public.queue_channel_availability();

revoke execute on function public.create_channel(uuid, text, text, text, numeric, jsonb) from public, anon;
grant execute on function public.create_channel(uuid, text, text, text, numeric, jsonb) to authenticated;
revoke execute on function public.channel_secret(uuid) from public, anon, authenticated;
grant execute on function public.channel_secret(uuid) to service_role;
revoke execute on function public.queue_channel_availability() from public, anon, authenticated;
