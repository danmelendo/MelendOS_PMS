-- Room hold while the guest books (30/09/2026). Replaces the web prebooking
-- ("save 30 min and pay later") and the fixed 60-minute window of unpaid
-- bookings:
--
-- - every pending (unpaid) booking holds its room until hold_expires_at;
-- - the web sets it 20 minutes ahead and the checkout page pushes it forward
--   while the guest is active (touch_booking_hold): after 20 minutes without
--   activity the hold lapses and the guest has to book again;
-- - starting a payment gives the bank time to answer (payments-create sets it
--   30 minutes ahead), so a guest who paid is never left without the room;
-- - a payment that still arrives late is handled by confirm_payment (confirms
--   if the room is free, otherwise flags a refund).
--
-- Rows from before this change have no hold_expires_at: they keep the old
-- 60 minutes from creation.

create or replace function public.pending_hold_until(p_hold timestamptz, p_created timestamptz)
returns timestamptz language sql immutable as $$
  select coalesce(p_hold, p_created + interval '60 minutes');
$$;

-- Cleaning buffer: a reservation occupies its room for
-- [start_at, end_at + cleaning_minutes). Mirrors @domain/availability.ts.
create or replace function public.check_reservation_gap()
returns trigger language plpgsql as $$
begin
  if new.status in ('cancelled', 'no_show', 'rejected') or new.manual_override then
    return new;
  end if;
  if exists (
    select 1 from public.reservations r
    where r.room_id = new.room_id
      and r.id <> new.id
      and (
        r.status in ('confirmed', 'in_progress', 'completed')
        or (r.status = 'pending' and public.pending_hold_until(r.hold_expires_at, r.created_at) > now())
      )
      and tstzrange(r.start_at, r.end_at + make_interval(mins => r.cleaning_minutes), '[)')
          && tstzrange(new.start_at, new.end_at + make_interval(mins => new.cleaning_minutes), '[)')
  ) then
    raise exception 'Conflicto de reserva: la habitación necesita al menos % minutos de limpieza entre reservas',
      new.cleaning_minutes using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;

-- Busy windows of a tenant's rooms (no guest data), for public availability.
create or replace function public.room_busy_windows(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (room_id uuid, start_at timestamptz, end_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.room_id, r.start_at, r.end_at + make_interval(mins => r.cleaning_minutes)
  from public.reservations r
  where r.tenant_id = p_tenant
    and r.start_at < p_to
    and r.end_at > p_from
    and (
      r.status in ('confirmed', 'in_progress', 'completed')
      or (r.status = 'pending' and public.pending_hold_until(r.hold_expires_at, r.created_at) > now())
    );
$$;

create or replace function public.cancel_stale_pending_reservations()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.reservations
     set status = 'rejected',
         cancellation_reason = 'Cancelación automática: no se completó el pago a tiempo'
   where status = 'pending' and not deposit_paid
     and public.pending_hold_until(hold_expires_at, created_at) < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The guest is still on the checkout page: keep the room 20 more minutes.
-- Only while the hold is alive (an expired one is not revived: the guest books
-- again) and never shortens it (a payment in progress has a longer margin).
-- Answers the new expiry, or null when there is nothing to hold.
create or replace function public.touch_booking_hold(p_id uuid, p_token text default null)
returns timestamptz language plpgsql security definer set search_path = public, extensions as $$
declare
  r public.reservations%rowtype;
  v_until timestamptz;
begin
  select * into r from public.guest_booking_row(p_id, p_token);
  if r.id is null then
    select * into r from public.reservations x
     where x.id = p_id and x.member_id is not null
       and public.is_member_user(x.tenant_id, x.member_id);
  end if;
  if r.id is null or r.status <> 'pending' or r.deposit_paid then
    return null;
  end if;
  if public.pending_hold_until(r.hold_expires_at, r.created_at) <= now() then
    return null;
  end if;
  update public.reservations
     set hold_expires_at = greatest(public.pending_hold_until(hold_expires_at, created_at),
                                    now() + interval '20 minutes')
   where id = r.id
  returning hold_expires_at into v_until;
  return v_until;
end;
$$;
revoke execute on function public.touch_booking_hold(uuid, text) from public;
grant execute on function public.touch_booking_hold(uuid, text) to anon, authenticated;
grant execute on function public.pending_hold_until(timestamptz, timestamptz) to anon, authenticated;

-- Expired holds become "rejected" soon, so the panel and the guest see it.
do $$
begin
  perform cron.schedule('cancel-stale-pending', '*/5 * * * *',
    $cron$ select public.cancel_stale_pending_reservations(); $cron$);
exception when others then
  raise notice 'pg_cron not available: job not rescheduled';
end $$;
