-- Bookings imported from the hotel's previous system (scripts/import-reservations.ts,
-- created_by_role = 'import'): when they are created, no confirmation email
-- (the guest already has one) and no SES.HOSPEDAJES booking report (the
-- previous system made it). From then on they are like any other booking:
-- check-in report, cancellation, emails on cancellation.

create or replace function public.queue_ses_communications()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_active constant text[] := array['confirmed', 'in_progress', 'completed'];
  r record;
begin
  if new.simulated or not exists (
    select 1 from public.ses_settings where tenant_id = new.tenant_id and enabled
  ) then
    return new;
  end if;
  -- Imported from the hotel's previous system: that system reported the
  -- booking. What happens from now on (check-in, cancellation) is ours.
  if tg_op = 'INSERT' and new.created_by_role = 'import' then
    return new;
  end if;

  -- Cancelled or refused: withdraw what was reported, drop what was not.
  if new.status in ('cancelled', 'rejected') then
    if tg_op = 'UPDATE' and old.status not in ('cancelled', 'rejected') then
      update public.ses_communications
         set status = 'skipped', error = null
       where reservation_id = new.id and status in ('pending', 'blocked', 'error');
      for r in
        select c.id, c.kind from public.ses_communications c
         where c.reservation_id = new.id and c.operation = 'A' and c.status in ('sent', 'accepted')
           and not exists (select 1 from public.ses_communications b where b.target_id = c.id)
      loop
        insert into public.ses_communications (tenant_id, reservation_id, kind, operation, target_id)
        values (new.tenant_id, new.id, r.kind, 'B', r.id);
      end loop;
    end if;
    return new;
  end if;

  -- Booking made (or confirmed on payment): report it.
  if new.status::text = any (v_active) and (tg_op = 'INSERT' or not old.status::text = any (v_active)) then
    if not exists (
      select 1 from public.ses_communications
       where reservation_id = new.id and kind = 'RH' and operation = 'A'
         and status not in ('skipped', 'cancelled', 'rejected')
    ) then
      insert into public.ses_communications (tenant_id, reservation_id, kind)
      values (new.tenant_id, new.id, 'RH');
    end if;
  -- Dates or guests changed after it was reported: cancel it and report again.
  -- (Before sending there is nothing to do: data is read at send time.)
  elsif tg_op = 'UPDATE' and new.status::text = any (v_active)
        and (new.start_at, new.end_at, new.people) is distinct from (old.start_at, old.end_at, old.people) then
    for r in
      select c.id from public.ses_communications c
       where c.reservation_id = new.id and c.kind = 'RH' and c.operation = 'A'
         and c.status in ('sent', 'accepted')
         and not exists (select 1 from public.ses_communications b where b.target_id = c.id)
    loop
      insert into public.ses_communications (tenant_id, reservation_id, kind, operation, target_id)
      values (new.tenant_id, new.id, 'RH', 'B', r.id);
      insert into public.ses_communications (tenant_id, reservation_id, kind)
      values (new.tenant_id, new.id, 'RH');
    end loop;
  end if;

  -- Check-in: the traveller report of everyone staying.
  if new.status = 'in_progress' and (tg_op = 'INSERT' or old.status <> 'in_progress')
     and not exists (
       select 1 from public.ses_communications
        where reservation_id = new.id and kind = 'PV' and operation = 'A'
          and status not in ('skipped', 'cancelled', 'rejected')
     ) then
    insert into public.ses_communications (tenant_id, reservation_id, kind)
    values (new.tenant_id, new.id, 'PV');
  end if;
  return new;
end;
$$;

create or replace function public.queue_guest_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  if new.simulated or coalesce(new.created_by_role, '') in ('ota', 'tour_operator') then
    return new;
  end if;
  -- Imported bookings were confirmed to the guest by the previous system.
  if tg_op = 'INSERT' and new.created_by_role = 'import' then
    return new;
  end if;
  if new.status::text = 'confirmed'
     and (tg_op = 'INSERT' or old.status::text in ('pending', 'rejected')) then
    v_kind := 'booking_confirmed';
  elsif tg_op = 'UPDATE' and new.status::text = 'cancelled' and old.status::text <> 'cancelled'
     -- a pending booking nobody paid for was never confirmed to the guest
     and (old.status::text <> 'pending' or new.payment_mode = 'at_hotel' or new.deposit_paid) then
    v_kind := 'booking_cancelled';
  else
    return new;
  end if;
  insert into public.guest_emails (tenant_id, reservation_id, kind)
  values (new.tenant_id, new.id, v_kind)
  on conflict (reservation_id, kind) do nothing;
  return new;
end;
$$;
