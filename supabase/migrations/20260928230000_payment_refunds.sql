-- Refunds made from the panel through the hotel's gateway (payments-refund):
-- until now the database only raised "payment.refund_required" and the hotel
-- refunded by hand in its gateway's back office.

alter table public.payments
  add column refunded_amount numeric(10,2) not null default 0 check (refunded_amount >= 0),
  add column refunded_at timestamptz;

-- Records a refund the gateway accepted (service role only: the Edge
-- Function calls it after the provider says yes). Keeps the payment and the
-- booking in step: what is left paid, and an event for the lake and reports.
create or replace function public.record_payment_refund(
  p_payment uuid, p_amount numeric, p_reference text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.payments%rowtype;
begin
  select * into p from public.payments where id = p_payment for update;
  if p.id is null or p.status not in ('succeeded', 'refunded') then
    raise exception 'Pago no encontrado' using errcode = 'no_data_found';
  end if;
  if p_amount <= 0 or p.refunded_amount + p_amount > p.amount then
    raise exception 'La devolución supera lo cobrado' using errcode = 'check_violation';
  end if;
  update public.payments
     set refunded_amount = refunded_amount + p_amount,
         refunded_at = now(),
         status = case when refunded_amount + p_amount >= amount then 'refunded'::public.payment_status else status end
   where id = p.id;
  update public.reservations
     set paid_amount = greatest(paid_amount - p_amount, 0)
   where id = p.reservation_id;
  insert into public.domain_events (tenant_id, event_type, entity, entity_id, actor_id, payload)
  values (p.tenant_id, 'payment.refunded', 'reservation', p.reservation_id, p_actor,
          jsonb_build_object('payment_id', p.id, 'provider', p.provider, 'amount', p_amount,
                             'reference', p_reference));
end;
$$;
revoke execute on function public.record_payment_refund(uuid, numeric, text, uuid) from public, anon, authenticated;

-- What can still be given back for a booking, for the panel (its staff only).
create or replace function public.refundable_payments(p_reservation uuid)
returns table (id uuid, provider text, amount numeric, refunded_amount numeric, refundable numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.provider::text, p.amount, p.refunded_amount, p.amount - p.refunded_amount, p.created_at
    from public.payments p
    join public.reservations r on r.id = p.reservation_id
   where p.reservation_id = p_reservation
     and p.status in ('succeeded', 'refunded')
     and p.provider in ('redsys', 'stripe')
     and public.is_tenant_member(r.tenant_id)
   order by p.created_at;
$$;
revoke execute on function public.refundable_payments(uuid) from public, anon;
grant execute on function public.refundable_payments(uuid) to authenticated;
