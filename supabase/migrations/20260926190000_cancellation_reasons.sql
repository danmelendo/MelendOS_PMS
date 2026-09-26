-- ─────────────────────────────────────────────────────────────────────────────
-- Why bookings are cancelled, in fixed groups (reports and the ML models learn
-- from a clean label), plus an internal note for the staff. Same list in TS:
-- supabase/functions/_shared/domain/cancellations.ts.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_cancellation_category(p text)
returns boolean language sql immutable set search_path = public as $$
  select p in ('change_of_plans', 'personal', 'work', 'travel_disruption', 'found_alternative',
               'booking_error', 'payment_not_completed', 'hotel_initiated', 'force_majeure',
               'no_reason', 'other');
$$;

alter table public.reservations
  add column cancellation_category text check (public.is_cancellation_category(cancellation_category)),
  add column cancellation_note text check (length(cancellation_note) <= 2000);

alter table public.cancellation_requests
  add column category text check (public.is_cancellation_category(category));

-- Every cancelled or rejected booking gets a group: rejected ones (payment
-- never completed) and cancellations nobody classified get a default; a
-- booking put back clears it.
create or replace function public.stamp_cancellation()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'cancelled' then
    if tg_op = 'INSERT' or old.status is distinct from 'cancelled' then
      new.cancelled_at := coalesce(new.cancelled_at, now());
    end if;
    new.cancellation_category := coalesce(new.cancellation_category, 'no_reason');
  elsif new.status = 'rejected' then
    new.cancelled_at := null;
    new.cancellation_category := coalesce(new.cancellation_category, 'payment_not_completed');
  else
    new.cancelled_at := null; -- reinstated
    new.cancellation_category := null;
  end if;
  return new;
end;
$$;
drop trigger reservations_stamp_cancellation on public.reservations;
create trigger reservations_stamp_cancellation
  before insert or update of status, cancellation_category on public.reservations
  for each row execute function public.stamp_cancellation();

-- Existing bookings. Real ones: rejected = payment not completed, the rest
-- unknown. Simulated history (demo): a plausible spread, like the simulator
-- now produces (_shared/sim/history.ts).
update public.reservations set cancellation_category = 'payment_not_completed'
 where status = 'rejected';
with b as (
  select id, (('x' || substr(md5(id::text), 1, 8))::bit(32)::bigint % 100) as n
    from public.reservations where status = 'cancelled' and simulated
)
update public.reservations r
   set cancellation_category = case
     when b.n < 30 then 'change_of_plans'
     when b.n < 45 then 'personal'
     when b.n < 55 then 'work'
     when b.n < 62 then 'travel_disruption'
     when b.n < 77 then 'found_alternative'
     when b.n < 83 then 'booking_error'
     when b.n < 87 then 'force_majeure'
     when b.n < 89 then 'hotel_initiated'
     else 'no_reason' end
  from b where b.id = r.id;
update public.reservations set cancellation_category = 'no_reason'
 where status = 'cancelled' and cancellation_category is null;

-- ── Guests cancelling (web link, guest app) and asking the hotel ─────────────
drop function public.cancel_guest_booking(uuid, text);
drop function public.cancel_my_reservation(uuid);
drop function public.request_guest_cancellation(uuid, text, text);
drop function public.cancel_booking_as_guest(public.reservations, text);

create function public.cancel_booking_as_guest(r public.reservations, p_actor text, p_category text)
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
     set status = 'cancelled', cancellation_reason = 'Cancelada por el huésped',
         cancellation_category = case when public.is_cancellation_category(p_category)
                                      then p_category else 'no_reason' end
   where id = r.id;
  if r.deposit_paid and r.paid_amount > 0 then
    insert into public.domain_events (tenant_id, event_type, entity, entity_id, payload)
    values (r.tenant_id, 'payment.refund_required', 'reservation', r.id,
            jsonb_build_object('amount', r.paid_amount, 'reason', 'free_cancellation', 'actor', p_actor));
  end if;
end;
$$;

create function public.cancel_guest_booking(p_id uuid, p_token text, p_category text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.guest_booking_row(p_id, p_token);
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  perform public.cancel_booking_as_guest(r, 'guest_link', p_category);
end;
$$;

create function public.cancel_my_reservation(p_reservation_id uuid, p_category text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.reservations where id = p_reservation_id for update;
  if not found or r.member_id is null or not public.is_member_user(r.tenant_id, r.member_id) then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  perform public.cancel_booking_as_guest(r, 'member', p_category);
end;
$$;

create function public.request_guest_cancellation(
  p_id uuid, p_token text, p_reason text default null, p_category text default null)
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
  insert into public.cancellation_requests (tenant_id, reservation_id, reason, category, channel)
  values (r.tenant_id, r.id, nullif(btrim(left(p_reason, 500)), ''),
          case when public.is_cancellation_category(p_category) then p_category end,
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

-- ── Reception decides; it can classify the reason and leave a note ──────────
drop function public.decide_cancellation(uuid, boolean, text);
create function public.decide_cancellation(
  p_request_id uuid, p_approve boolean, p_note text default null, p_category text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  req public.cancellation_requests%rowtype;
  v_category text := case when public.is_cancellation_category(p_category) then p_category end;
begin
  select * into req from public.cancellation_requests where id = p_request_id for update;
  if not found or not public.is_tenant_member(req.tenant_id) then
    raise exception 'Solicitud no encontrada' using errcode = 'no_data_found';
  end if;
  if req.status <> 'pending' then
    raise exception 'La solicitud ya está resuelta' using errcode = 'check_violation';
  end if;
  update public.cancellation_requests
     set status = case when p_approve then 'approved'::public.cancellation_status else 'rejected' end,
         decided_at = now(), decided_by = auth.uid(), decision_note = p_note,
         category = coalesce(v_category, category)
   where id = req.id;
  if p_approve then
    update public.reservations
       set status = 'cancelled',
           cancellation_reason = coalesce(nullif(btrim(req.reason), ''), 'Cancelada a petición del huésped'),
           cancellation_category = coalesce(v_category, req.category, 'no_reason'),
           cancellation_note = nullif(btrim(left(p_note, 2000)), '')
     where id = req.reservation_id and status in ('pending', 'confirmed');
  end if;
  insert into public.domain_events (tenant_id, event_type, entity, entity_id, actor_id, payload)
  values (req.tenant_id,
          case when p_approve then 'cancellation.approved' else 'cancellation.rejected' end,
          'reservation', req.reservation_id, auth.uid(),
          jsonb_build_object('request_id', req.id, 'channel', req.channel,
                             'category', coalesce(v_category, req.category)));
end;
$$;

revoke execute on function public.cancel_booking_as_guest(public.reservations, text, text) from public, anon, authenticated;
revoke execute on function public.cancel_guest_booking(uuid, text, text) from public;
grant execute on function public.cancel_guest_booking(uuid, text, text) to anon, authenticated;
revoke execute on function public.cancel_my_reservation(uuid, text) from public, anon;
grant execute on function public.cancel_my_reservation(uuid, text) to authenticated;
revoke execute on function public.request_guest_cancellation(uuid, text, text, text) from public;
grant execute on function public.request_guest_cancellation(uuid, text, text, text) to anon, authenticated;
revoke execute on function public.decide_cancellation(uuid, boolean, text, text) from public, anon;
grant execute on function public.decide_cancellation(uuid, boolean, text, text) to authenticated;
grant execute on function public.is_cancellation_category(text) to anon, authenticated;

-- ── Stay facts carry the reason (appended as the 11th column) ───────────────
create or replace function public.report_stays(p_from date, p_to date, p_tenant uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with t as (
    select id, coalesce(settings->>'timezone', 'Europe/Madrid') as tz
    from public.tenants
    where public.is_tenant_member(id) and (p_tenant is null or id = p_tenant)
      and public.tenant_feature(id, 'reports')
  ),
  s as (
    select r.tenant_id, r.room_id,
           (r.start_at at time zone t.tz)::date as check_in,
           (r.end_at at time zone t.tz)::date as check_out,
           (r.created_at at time zone t.tz)::date as created,
           (r.cancelled_at at time zone t.tz)::date as cancelled,
           r.status, r.created_by_role as channel, r.people,
           r.base_price + r.dynamic_surcharge - r.discount_amount as room_revenue,
           r.cancellation_category
    from public.reservations r join t on t.id = r.tenant_id
    -- Coarse filter with a day of margin (index friendly); exact one below.
    where (r.start_at < (p_to + 2)::timestamp at time zone t.tz
           and r.end_at > (p_from - 1)::timestamp at time zone t.tz)
       or (r.created_at >= (p_from - 1)::timestamp at time zone t.tz
           and r.created_at < (p_to + 2)::timestamp at time zone t.tz)
  )
  select jsonb_build_object(
    'rooms', coalesce((
      select jsonb_object_agg(ro.tenant_id, ro.n)
      from (select tenant_id, count(*) as n from public.rooms
            where active and tenant_id in (select id from t) group by tenant_id) ro
    ), '{}'::jsonb),
    'stays', coalesce((
      select jsonb_agg(jsonb_build_array(tenant_id, room_id, check_in, check_out, created, cancelled,
                                         status, channel, people, room_revenue, cancellation_category))
      from s
      where (check_in <= p_to and check_out > p_from) or created between p_from and p_to
    ), '[]'::jsonb)
  );
$$;
