-- Refunds still owed, for the "Hoy" page: cancelled or rejected bookings with
-- money paid online that has not been given back. The suggested amount follows
-- the conditions copied into the booking: a late cancellation keeps its fee.

create or replace function public.pending_refunds()
returns table (
  reservation_id uuid,
  tenant_id uuid,
  status text,
  start_at timestamptz,
  end_at timestamptz,
  cancelled_at timestamptz,
  room_name text,
  guest_name text,
  refundable numeric,
  late_fee numeric,
  suggested numeric
)
language sql stable security definer set search_path = public as $$
  with online as (
    select p.reservation_id, sum(p.amount - p.refunded_amount) as refundable
      from public.payments p
     where p.status in ('succeeded', 'refunded')
       and p.provider in ('redsys', 'stripe')
       and p.amount > p.refunded_amount
     group by p.reservation_id
  ), owed as (
    select r.*, o.refundable,
           case when r.status = 'cancelled'
                 and r.free_cancellation_until is not null
                 and coalesce(r.cancelled_at, now()) > r.free_cancellation_until
                then coalesce(r.late_cancellation_fee, 0) else 0 end as late_fee
      from public.reservations r
      join online o on o.reservation_id = r.id
     where r.status in ('cancelled', 'rejected')
       and public.is_tenant_staff(r.tenant_id)
  )
  select w.id, w.tenant_id, w.status::text, w.start_at, w.end_at, w.cancelled_at,
         rm.name, coalesce(c.name, m.name),
         w.refundable, w.late_fee, greatest(w.refundable - w.late_fee, 0)
    from owed w
    left join public.rooms rm on rm.id = w.room_id
    left join public.customers c on c.id = w.customer_id
    left join public.members m on m.id = w.member_id
   where w.refundable - w.late_fee > 0
   order by coalesce(w.cancelled_at, w.updated_at) desc
   limit 100;
$$;
revoke execute on function public.pending_refunds() from public, anon;
grant execute on function public.pending_refunds() to authenticated;

-- The hotel gave the money back outside Melend/OS (its gateway's back office,
-- a bank transfer): record it so the booking stops showing as owed. Reception
-- or management of the hotel; group management cannot (forbid_group_operations
-- on payments). Leaves an event with who did it.
create or replace function public.record_external_refund(p_reservation uuid, p_amount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_left numeric := p_amount;
  p record;
  v_take numeric;
begin
  select r.tenant_id into v_tenant from public.reservations r where r.id = p_reservation;
  if v_tenant is null or not public.is_tenant_staff(v_tenant) then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Importe no válido' using errcode = 'check_violation';
  end if;
  if p_amount > (select coalesce(sum(amount - refunded_amount), 0) from public.payments
                  where reservation_id = p_reservation and status in ('succeeded', 'refunded')
                    and provider in ('redsys', 'stripe')) then
    raise exception 'La devolución supera lo cobrado' using errcode = 'check_violation';
  end if;
  for p in
    select id, amount - refunded_amount as left_amount from public.payments
     where reservation_id = p_reservation and status in ('succeeded', 'refunded')
       and provider in ('redsys', 'stripe') and amount > refunded_amount
     order by created_at desc
  loop
    exit when v_left <= 0;
    v_take := least(v_left, p.left_amount);
    perform public.record_payment_refund(p.id, v_take, 'external', auth.uid());
    v_left := v_left - v_take;
  end loop;
  return p_amount;
end;
$$;
revoke execute on function public.record_external_refund(uuid, numeric) from public, anon;
grant execute on function public.record_external_refund(uuid, numeric) to authenticated;
