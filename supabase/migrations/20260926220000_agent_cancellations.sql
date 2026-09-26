-- ─────────────────────────────────────────────────────────────────────────────
-- The booking agent (and MCP) can cancel a booking for the guest, with the
-- same rules as the guest cancelling on the web (cancel_booking_as_guest):
-- free inside the window (refund flagged if paid online), otherwise refused
-- (the tool then files a request for the hotel). Called only from the server,
-- after the tool has verified the guest (reference + email + arrival date)
-- and the guest has confirmed the terms.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.cancel_booking_for_channel(
  p_tenant uuid, p_reservation uuid, p_channel text, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.reservations
   where id = p_reservation and tenant_id = p_tenant
   for update;
  if not found then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  perform public.cancel_booking_as_guest(r, p_channel, p_category);
  return jsonb_build_object(
    'refund', case when r.deposit_paid then r.paid_amount else 0 end);
end;
$$;

revoke execute on function public.cancel_booking_for_channel(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.cancel_booking_for_channel(uuid, uuid, text, text) to service_role;
