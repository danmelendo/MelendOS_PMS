-- ─────────────────────────────────────────────────────────────────────────────
-- What the web, the guest app and reception need beyond plain table access:
-- server-side booking journal, guest actions as checked functions, reception
-- room status, and loyalty points when a payment is confirmed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Booking journal written by the database ─────────────────────────────────
-- Clients (guests) cannot write the journal; these triggers record the
-- lifecycle so the panel and the guest app share one history.
create or replace function public.journal_reservation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_event text;
  v_actor text := coalesce(new.created_by_role, 'staff');
  v_payload jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    v_event := case when new.is_prebooking then 'prebooked' else 'created' end;
    v_payload := jsonb_build_object('room_id', new.room_id, 'total', new.total);
  elsif new.status is distinct from old.status then
    v_event := case new.status
      when 'confirmed' then 'confirmed'
      when 'in_progress' then 'checked_in'
      when 'completed' then 'checked_out'
      when 'cancelled' then 'cancelled'
      when 'rejected' then 'rejected'
      when 'no_show' then 'no_show'
      else null end;
    v_actor := case when auth.uid() is null then 'system' else 'staff' end;
    if new.status = 'confirmed' then
      v_payload := jsonb_build_object('deposit', new.paid_amount);
    end if;
  end if;
  if v_event is null then
    return new;
  end if;
  insert into public.booking_journal (tenant_id, booking_ref, member_id, property_id, event_type, actor, payload)
  values (new.tenant_id, new.id::text, new.member_id, new.property_id, v_event, v_actor, v_payload);
  return new;
end;
$$;
create trigger reservations_journal after insert or update of status on public.reservations
  for each row execute function public.journal_reservation();

create or replace function public.journal_signature()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  if new.status <> 'signed' then
    return new;
  end if;
  select * into r from public.reservations where id = new.reservation_id;
  insert into public.booking_journal (tenant_id, booking_ref, member_id, property_id, event_type, actor, payload)
  values (new.tenant_id, new.reservation_id::text, r.member_id, r.property_id, 'signed', 'member',
          jsonb_build_object('doc', new.doc_type));
  return new;
end;
$$;
create trigger signatures_journal after insert or update of status on public.signatures
  for each row execute function public.journal_signature();

-- ── Guest actions ────────────────────────────────────────────────────────────
-- A guest cancels one of their own stays that is not paid yet (a hold or a
-- pending booking). Paid stays are cancelled by the hotel (refund policy).
create or replace function public.cancel_my_reservation(p_reservation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.reservations where id = p_reservation_id for update;
  if not found or r.member_id is null or not public.is_member_user(r.tenant_id, r.member_id) then
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

-- A guest redeems a reward with their own points.
create or replace function public.redeem_reward(p_member_id uuid, p_reward_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  m public.members%rowtype;
  rw public.rewards%rowtype;
  acc public.loyalty_accounts%rowtype;
begin
  select * into m from public.members where id = p_member_id;
  if not found or not public.is_member_user(m.tenant_id, m.id) then
    raise exception 'Cuenta no encontrada' using errcode = 'no_data_found';
  end if;
  select * into rw from public.rewards where id = p_reward_id and tenant_id = m.tenant_id and active;
  if not found then
    raise exception 'Recompensa no encontrada' using errcode = 'no_data_found';
  end if;
  select * into acc from public.loyalty_accounts where member_id = m.id for update;
  if not found or acc.points < rw.cost_points then
    raise exception 'Puntos insuficientes' using errcode = 'check_violation';
  end if;
  update public.loyalty_accounts set points = points - rw.cost_points where id = acc.id;
  insert into public.loyalty_transactions (tenant_id, member_id, type, points, reason)
  values (m.tenant_id, m.id, 'redeem', -rw.cost_points, 'Canje · ' || rw.name);
  insert into public.booking_journal (tenant_id, booking_ref, member_id, event_type, actor, payload)
  values (m.tenant_id, 'reward-' || rw.id, m.id, 'reward_redeemed', 'member',
          jsonb_build_object('reward', rw.name, 'points', rw.cost_points));
  return acc.points - rw.cost_points;
end;
$$;

-- ── Loyalty points when a member's stay is paid ──────────────────────────────
create or replace function public.award_stay_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_points integer;
  v_ppe numeric;
begin
  if new.member_id is null or not new.deposit_paid or old.deposit_paid then
    return new;
  end if;
  select coalesce(t.points_per_euro, 1) into v_ppe
    from public.loyalty_accounts a
    left join public.loyalty_tiers t on t.id = a.tier_id
   where a.member_id = new.member_id;
  v_points := round(new.total * coalesce(v_ppe, 1));
  if v_points <= 0 then
    return new;
  end if;
  insert into public.loyalty_accounts (tenant_id, member_id, points, lifetime_points)
  values (new.tenant_id, new.member_id, v_points, v_points)
  on conflict (tenant_id, member_id) do update
    set points = loyalty_accounts.points + v_points,
        lifetime_points = loyalty_accounts.lifetime_points + v_points;
  insert into public.loyalty_transactions (tenant_id, member_id, type, points, reason, reservation_id)
  values (new.tenant_id, new.member_id, 'earn', v_points, 'Estancia confirmada', new.id);
  insert into public.booking_journal (tenant_id, booking_ref, member_id, property_id, event_type, actor, payload)
  values (new.tenant_id, new.id::text, new.member_id, new.property_id, 'points_earned', 'system',
          jsonb_build_object('points', v_points));
  return new;
end;
$$;
create trigger reservations_award_points after update of deposit_paid on public.reservations
  for each row execute function public.award_stay_points();

-- ── Reception updates room status (and only that) ────────────────────────────
create policy rooms_staff_update on public.rooms
  for update to authenticated
  using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));

create or replace function public.guard_room_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.has_tenant_role(new.tenant_id, 'admin') or auth.uid() is null then
    return new;
  end if;
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Solo administración puede editar la habitación' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger rooms_guard_update before update on public.rooms
  for each row execute function public.guard_room_update();

-- ── Grants ───────────────────────────────────────────────────────────────────
revoke execute on function public.cancel_my_reservation(uuid) from public, anon;
revoke execute on function public.redeem_reward(uuid, uuid) from public, anon;
grant execute on function public.cancel_my_reservation(uuid) to authenticated;
grant execute on function public.redeem_reward(uuid, uuid) to authenticated;
revoke execute on function public.journal_reservation() from public, anon, authenticated;
revoke execute on function public.journal_signature() from public, anon, authenticated;
revoke execute on function public.award_stay_points() from public, anon, authenticated;
revoke execute on function public.guard_room_update() from public, anon, authenticated;
