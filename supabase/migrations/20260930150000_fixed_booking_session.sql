-- The booking session is fixed (30/09/2026, Dan: "que no se renueve esa sesión
-- de 20 mins"): an unpaid booking holds its room for 20 minutes from when the
-- guest started booking, and only the bank gets a margin once they start
-- paying (payments-create). Nothing extends it any more, so the renewal the
-- checkout page used to call (20260930120000_booking_hold.sql) goes away: no
-- client can push a hold forward.
drop function if exists public.touch_booking_hold(uuid, text);
