-- ─────────────────────────────────────────────────────────────────────────────
-- Stay phase (B): chat between the guest and reception, one conversation per
-- booking. Requests (towels, room service, late checkout…) are tagged messages
-- instead of a form. The booking agent will answer here too ('assistant').
-- ─────────────────────────────────────────────────────────────────────────────

create type public.message_sender as enum ('guest', 'staff', 'assistant', 'system');

create table public.stay_messages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  reservation_id  uuid not null,
  sender          public.message_sender not null,
  body            text not null check (length(btrim(body)) between 1 and 2000),
  -- Quick request the message stands for, if any.
  category        text check (category in ('towels', 'housekeeping', 'room_service', 'maintenance',
                                           'valet', 'early_checkin', 'late_checkout', 'other')),
  staff_id        uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- When the other side read it (reception for guest messages and vice versa).
  read_at         timestamptz,
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete cascade
);
create index stay_messages_thread_idx on public.stay_messages (reservation_id, created_at);
create index stay_messages_inbox_idx on public.stay_messages (tenant_id, created_at desc);

alter table public.stay_messages enable row level security;
-- Reception: read the hotel's conversations, write as staff, mark as read.
create policy stay_messages_staff_read on public.stay_messages
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy stay_messages_staff_write on public.stay_messages
  for insert to authenticated
  with check (public.is_tenant_member(tenant_id) and sender = 'staff' and staff_id = auth.uid());
create policy stay_messages_staff_read_mark on public.stay_messages
  for update to authenticated
  using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
-- Staff may only change read_at (messages are never edited).
revoke update on public.stay_messages from anon, authenticated;
grant update (read_at) on public.stay_messages to authenticated;

-- Live updates for the reception inbox.
alter publication supabase_realtime add table public.stay_messages;

-- The booking a guest may talk about: with the booking token, or as the
-- member who made it. Internal helper.
create or replace function public.guest_stay(p_id uuid, p_token text)
returns public.reservations language plpgsql stable security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  if p_token is not null then
    select * into r from public.guest_booking_row(p_id, p_token);
  else
    select * into r from public.reservations
     where id = p_id and member_id is not null and public.is_member_user(tenant_id, member_id);
  end if;
  return r;
end;
$$;
revoke execute on function public.guest_stay(uuid, text) from public, anon, authenticated;

-- Guest reads the conversation (and marks reception's messages as read).
create or replace function public.get_stay_messages(p_reservation_id uuid, p_token text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.guest_stay(p_reservation_id, p_token);
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  update public.stay_messages set read_at = now()
   where reservation_id = r.id and sender <> 'guest' and read_at is null;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'sender', sender, 'body', body,
                                        'category', category, 'created_at', created_at,
                                        'read_at', read_at) order by created_at)
      from (select * from public.stay_messages where reservation_id = r.id
             order by created_at desc limit 200) m
  ), '[]'::jsonb);
end;
$$;

-- Guest writes to reception: bookings that are coming up, in house, or just
-- finished (three days, for things left behind). Rate limited.
create or replace function public.send_stay_message(
  p_reservation_id uuid, p_token text, p_body text, p_category text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.reservations%rowtype;
  v_id uuid;
begin
  select * into r from public.guest_stay(p_reservation_id, p_token);
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if not public.tenant_feature(r.tenant_id, 'chat') then
    raise exception 'Este hotel no tiene chat con recepción' using errcode = 'check_violation';
  end if;
  if not (r.status in ('pending', 'confirmed', 'in_progress')
          or (r.status = 'completed' and r.end_at > now() - interval '3 days')) then
    raise exception 'La conversación de esta reserva está cerrada' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.stay_messages
       where reservation_id = r.id and sender = 'guest'
         and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Demasiados mensajes seguidos; espera un momento' using errcode = 'check_violation';
  end if;
  insert into public.stay_messages (tenant_id, reservation_id, sender, body, category)
  values (r.tenant_id, r.id, 'guest', btrim(left(p_body, 2000)), p_category)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.get_stay_messages(uuid, text) from public;
revoke execute on function public.send_stay_message(uuid, text, text, text) from public;
grant execute on function public.get_stay_messages(uuid, text) to anon, authenticated;
grant execute on function public.send_stay_message(uuid, text, text, text) to anon, authenticated;
