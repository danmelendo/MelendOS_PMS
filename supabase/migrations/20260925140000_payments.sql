-- ─────────────────────────────────────────────────────────────────────────────
-- Payments: gateway secrets from Vault and idempotent confirmation.
-- Both functions are server-side only (service_role, i.e. Edge Functions).
-- ─────────────────────────────────────────────────────────────────────────────

-- Gateway secret (Redsys key, Stripe secret / webhook secret) by Vault name.
create or replace function public.get_payment_secret(p_name text)
returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;

-- Applies a verified provider notification. Idempotent: replays of the same
-- notification return 'already_processed'. The amount must match what we asked
-- for, so a tampered or partial charge never confirms a reservation.
create or replace function public.confirm_payment(
  p_provider public.payment_provider,
  p_ref text,
  p_amount numeric,
  p_succeeded boolean,
  p_raw jsonb
) returns text language plpgsql security definer set search_path = public as $$
declare
  v public.payments%rowtype;
begin
  select * into v from public.payments
   where provider = p_provider and provider_ref = p_ref
   for update;
  if not found then
    return 'unknown_payment';
  end if;
  if v.status in ('succeeded', 'refunded') then
    return 'already_processed';
  end if;

  if not p_succeeded then
    update public.payments
       set status = 'failed', verified_at = now(), raw_notification = p_raw
     where id = v.id;
    update public.reservations
       set status = 'rejected', cancellation_reason = 'Pago rechazado por la pasarela'
     where id = v.reservation_id and status = 'pending' and not deposit_paid;
    return 'failed';
  end if;

  if p_amount is not null and round(p_amount, 2) <> round(v.amount, 2) then
    update public.payments
       set status = 'failed', verified_at = now(), raw_notification = p_raw
     where id = v.id;
    insert into public.domain_events (tenant_id, event_type, entity, entity_id, payload)
    values (v.tenant_id, 'payment.amount_mismatch', 'payment', v.id,
            jsonb_build_object('expected', v.amount, 'received', p_amount));
    return 'amount_mismatch';
  end if;

  update public.payments
     set status = 'succeeded', verified_at = now(), raw_notification = p_raw
   where id = v.id;

  begin
    update public.reservations
       set deposit_paid = true,
           paid_amount = paid_amount + v.amount,
           status = case when status in ('pending', 'rejected') then 'confirmed' else status end,
           is_prebooking = false,
           hold_expires_at = null,
           cancellation_reason = null,
           redsys_order = p_ref
     where id = v.reservation_id;
  exception when exclusion_violation then
    -- Paid after the hold expired and someone else took the room: keep the
    -- money recorded and flag it for a refund instead of double-booking.
    insert into public.domain_events (tenant_id, event_type, entity, entity_id, payload)
    values (v.tenant_id, 'payment.refund_required', 'payment', v.id,
            jsonb_build_object('reservation_id', v.reservation_id, 'reason', 'room_taken'));
    return 'refund_required';
  end;

  insert into public.domain_events (tenant_id, event_type, entity, entity_id, payload)
  values (v.tenant_id, 'payment.succeeded', 'payment', v.id,
          jsonb_build_object('reservation_id', v.reservation_id, 'amount', v.amount, 'provider', p_provider));
  return 'succeeded';
end;
$$;

revoke execute on function public.get_payment_secret(text) from public, anon, authenticated;
revoke execute on function public.confirm_payment(public.payment_provider, text, numeric, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.get_payment_secret(text) to service_role;
grant execute on function public.confirm_payment(public.payment_provider, text, numeric, boolean, jsonb)
  to service_role;
