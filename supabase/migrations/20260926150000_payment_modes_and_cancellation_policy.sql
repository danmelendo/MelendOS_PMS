-- ─────────────────────────────────────────────────────────────────────────────
-- No more deposits: the guest pays the whole stay online when booking
-- (payment_mode 'prepay') or pays at the hotel ('at_hotel'); each hotel offers
-- one or both. Cancellation policy per hotel: free until N hours before
-- check-in, then a fee (none, first night or whole stay). The terms are copied
-- into each booking when it is made, so later policy changes do not alter
-- what the guest accepted.
--
-- Legacy names kept for the data lake contract: deposit_amount is now "amount
-- to pay online when booking" (the total with prepay, 0 at the hotel) and
-- deposit_paid means "paid online".
-- Same rules in TS: supabase/functions/_shared/domain/policies.ts.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.reservations
  add column payment_mode text not null default 'prepay' check (payment_mode in ('prepay', 'at_hotel')),
  add column free_cancellation_until timestamptz,
  add column late_cancellation_fee numeric(10,2);

-- Bookings made at reception are paid at the hotel.
update public.reservations
   set payment_mode = 'at_hotel', deposit_amount = 0
 where created_by_role in ('admin', 'staff', 'reception') and not deposit_paid;
update public.reservations
   set deposit_amount = total
 where payment_mode = 'prepay' and not deposit_paid and status = 'pending';

-- ── Policy of a hotel ────────────────────────────────────────────────────────
create or replace function public.hotel_free_cancellation_hours(p_tenant uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    case when (settings->'cancellation'->>'free_hours') ~ '^\d+(\.\d+)?$'
         then (settings->'cancellation'->>'free_hours')::numeric end,
    48)
  from public.tenants where id = p_tenant;
$$;

create or replace function public.hotel_cancellation_penalty(p_tenant uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when settings->'cancellation'->>'penalty' in ('none', 'first_night', 'full')
              then settings->'cancellation'->>'penalty' else 'first_night' end
  from public.tenants where id = p_tenant;
$$;

-- Copies the cancellation terms into a new booking (all channels).
create or replace function public.stamp_cancellation_terms()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nights numeric := greatest(1, round(extract(epoch from (new.end_at - new.start_at)) / 86400.0));
  v_penalty text := public.hotel_cancellation_penalty(new.tenant_id);
begin
  new.free_cancellation_until := coalesce(
    new.free_cancellation_until,
    new.start_at - make_interval(hours => public.hotel_free_cancellation_hours(new.tenant_id)::int));
  new.late_cancellation_fee := coalesce(
    new.late_cancellation_fee,
    case v_penalty when 'none' then 0
                   when 'full' then new.total
                   else round(new.total / v_nights, 2) end);
  return new;
end;
$$;
create trigger reservations_cancellation_terms before insert on public.reservations
  for each row execute function public.stamp_cancellation_terms();

-- Terms for the bookings that already exist.
update public.reservations r
   set free_cancellation_until = r.start_at - make_interval(hours => public.hotel_free_cancellation_hours(r.tenant_id)::int),
       late_cancellation_fee = case public.hotel_cancellation_penalty(r.tenant_id)
         when 'none' then 0 when 'full' then r.total
         else round(r.total / greatest(1, round(extract(epoch from (r.end_at - r.start_at)) / 86400.0)), 2) end
 where free_cancellation_until is null;

-- ── Guests cancelling ────────────────────────────────────────────────────────
-- Free while the terms allow it (or while nothing is paid on a pending
-- booking). A stay paid online is flagged for refund. Late cancellations are
-- requests the hotel decides on (request_guest_cancellation).
create or replace function public.cancel_booking_as_guest(r public.reservations, p_actor text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if r.status = 'pending' and not r.deposit_paid then
    null; -- nothing paid, nothing committed
  elsif r.status in ('pending', 'confirmed') and now() <= r.free_cancellation_until then
    null; -- free cancellation window
  else
    raise exception 'Fuera del plazo de cancelación gratuita: solicita la cancelación al hotel'
      using errcode = 'check_violation';
  end if;
  update public.reservations
     set status = 'cancelled', cancellation_reason = 'Cancelada por el huésped'
   where id = r.id;
  if r.deposit_paid and r.paid_amount > 0 then
    insert into public.domain_events (tenant_id, event_type, entity, entity_id, payload)
    values (r.tenant_id, 'payment.refund_required', 'reservation', r.id,
            jsonb_build_object('amount', r.paid_amount, 'reason', 'free_cancellation', 'actor', p_actor));
  end if;
end;
$$;

create or replace function public.cancel_guest_booking(p_id uuid, p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.guest_booking_row(p_id, p_token);
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  perform public.cancel_booking_as_guest(r, 'guest_link');
end;
$$;

create or replace function public.cancel_my_reservation(p_reservation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.reservations where id = p_reservation_id for update;
  if not found or r.member_id is null or not public.is_member_user(r.tenant_id, r.member_id) then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  perform public.cancel_booking_as_guest(r, 'member');
end;
$$;

-- Outside the free window: the guest asks, reception decides (fee applies).
create or replace function public.request_guest_cancellation(p_id uuid, p_token text, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.reservations%rowtype;
  v_id uuid;
begin
  select * into r from public.guest_stay(p_id, p_token);
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if r.status not in ('pending', 'confirmed') then
    raise exception 'Esta reserva ya no se puede cancelar' using errcode = 'check_violation';
  end if;
  insert into public.cancellation_requests (tenant_id, reservation_id, reason, channel)
  values (r.tenant_id, r.id, nullif(btrim(left(p_reason, 500)), ''),
          case when p_token is null then 'guest_app' else 'web' end)
  on conflict (reservation_id) where status = 'pending' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.cancellation_requests
     where reservation_id = r.id and status = 'pending';
  end if;
  return v_id;
end;
$$;

-- The guest's booking view gets the payment mode and the terms.
create or replace function public.get_guest_booking(p_id uuid, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.reservations%rowtype;
  v jsonb;
begin
  select * into r from public.guest_booking_row(p_id, p_token);
  if r.id is null then
    return null;
  end if;
  select jsonb_build_object(
    'id', r.id,
    'tenant_id', r.tenant_id,
    'property_id', r.property_id,
    'property_name', p.name,
    'room_id', r.room_id,
    'room_name', ro.name,
    'start_at', r.start_at,
    'end_at', r.end_at,
    'people', r.people,
    'total', r.total,
    'deposit_amount', r.deposit_amount,
    'deposit_paid', r.deposit_paid,
    'paid_amount', r.paid_amount,
    'payment_mode', r.payment_mode,
    'free_cancellation_until', r.free_cancellation_until,
    'late_cancellation_fee', r.late_cancellation_fee,
    'reference', r.reference,
    'status', r.status,
    'is_prebooking', r.is_prebooking,
    'hold_expires_at', r.hold_expires_at,
    'internal_notes', null,
    'created_at', r.created_at,
    'signature', (
      select jsonb_build_object('id', s.id, 'doc_type', s.doc_type, 'signer_name', s.signer_name,
                                'status', s.status, 'signed_at', s.signed_at)
      from public.signatures s where s.reservation_id = r.id
      order by s.created_at desc limit 1
    ),
    'journal', coalesce((
      select jsonb_agg(jsonb_build_object('id', j.id, 'event_type', j.event_type, 'actor', j.actor,
                                          'payload', j.payload, 'created_at', j.created_at)
                       order by j.created_at desc)
      from public.booking_journal j where j.booking_ref = r.id::text
    ), '[]'::jsonb)
  ) into v
  from public.rooms ro
  left join public.properties p on p.id = r.property_id
  where ro.id = r.room_id;
  return v;
end;
$$;

revoke execute on function public.hotel_free_cancellation_hours(uuid) from public, anon, authenticated;
revoke execute on function public.hotel_cancellation_penalty(uuid) from public, anon, authenticated;
revoke execute on function public.stamp_cancellation_terms() from public, anon, authenticated;
revoke execute on function public.cancel_booking_as_guest(public.reservations, text) from public, anon, authenticated;
revoke execute on function public.request_guest_cancellation(uuid, text, text) from public;
grant execute on function public.request_guest_cancellation(uuid, text, text) to anon, authenticated;
