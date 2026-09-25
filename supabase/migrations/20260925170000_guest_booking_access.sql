-- ─────────────────────────────────────────────────────────────────────────────
-- Guest access to a booking made without an account ("manage your booking").
-- bookings-create returns a random token once and stores only its SHA-256.
-- These functions need the reservation id AND the token; neither alone reveals
-- anything.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto with schema extensions;

alter table public.reservations add column access_token_hash text;

create or replace function public.guest_booking_row(p_id uuid, p_token text)
returns public.reservations language sql stable security definer set search_path = public, extensions as $$
  select r.* from public.reservations r
  where r.id = p_id
    and r.access_token_hash is not null
    and p_token is not null
    and r.access_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

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

create or replace function public.sign_guest_registration(
  p_id uuid, p_token text, p_signer text, p_signature_data text
) returns void language plpgsql security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.guest_booking_row(p_id, p_token);
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if length(coalesce(p_signer, '')) < 2 or length(coalesce(p_signature_data, '')) > 500000 then
    raise exception 'Firma no válida' using errcode = 'check_violation';
  end if;
  delete from public.signatures where reservation_id = r.id and status = 'pending';
  insert into public.signatures (tenant_id, reservation_id, doc_type, signer_name, signature_data, status, signed_at)
  values (r.tenant_id, r.id, 'guest_registration', btrim(p_signer), p_signature_data, 'signed', now());
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
  if r.status <> 'pending' or r.deposit_paid then
    raise exception 'Esta reserva solo la puede cancelar el hotel' using errcode = 'check_violation';
  end if;
  update public.reservations
     set status = 'cancelled', cancellation_reason = 'Cancelada por el huésped'
   where id = r.id;
end;
$$;

revoke execute on function public.guest_booking_row(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_guest_booking(uuid, text) from public;
revoke execute on function public.sign_guest_registration(uuid, text, text, text) from public;
revoke execute on function public.cancel_guest_booking(uuid, text) from public;
grant execute on function public.get_guest_booking(uuid, text) to anon, authenticated;
grant execute on function public.sign_guest_registration(uuid, text, text, text) to anon, authenticated;
grant execute on function public.cancel_guest_booking(uuid, text) to anon, authenticated;
