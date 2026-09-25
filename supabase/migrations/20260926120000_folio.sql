-- ─────────────────────────────────────────────────────────────────────────────
-- Stay phase (C): the guest's bill (folio). Services charged to the stay
-- during it, stay extensions approved by reception, and paying the balance
-- online or at the front desk.
-- ─────────────────────────────────────────────────────────────────────────────

-- Front-desk payments (cash or card terminal) next to the online gateways.
alter type public.payment_provider add value if not exists 'desk';
alter table public.payments
  add column kind text not null default 'deposit' check (kind in ('deposit', 'balance'));

-- ── In-stay services (catalogue) ─────────────────────────────────────────────
-- Different from extras (added when booking): these are ordered or charged
-- during the stay.
create table public.stay_services (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  category    text not null check (category in ('food', 'catering', 'laundry', 'parking', 'minibar', 'spa', 'other')),
  name        text not null,
  description text,
  price       numeric(10,2) not null check (price >= 0),
  unit        text not null default 'unidad',
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id)
);
alter table public.stay_services enable row level security;
create policy stay_services_public_read on public.stay_services
  for select to anon, authenticated using (active or public.is_tenant_member(tenant_id));
create policy stay_services_admin_write on public.stay_services
  for all to authenticated
  using (public.has_tenant_role(tenant_id, 'admin')) with check (public.has_tenant_role(tenant_id, 'admin'));

-- ── Charges to the stay ──────────────────────────────────────────────────────
create table public.folio_charges (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  reservation_id  uuid not null,
  service_id      uuid,
  category        text not null check (category in ('food', 'catering', 'laundry', 'parking', 'minibar', 'spa', 'other')),
  description     text not null check (length(btrim(description)) between 1 and 200),
  qty             numeric(8,2) not null default 1 check (qty > 0 and qty <= 1000),
  unit_price      numeric(10,2) not null check (unit_price >= 0),
  amount          numeric(10,2) generated always as (round(qty * unit_price, 2)) stored,
  -- requested: ordered by the guest, reception confirms it (posted) or not (void).
  status          text not null default 'posted' check (status in ('requested', 'posted', 'void')),
  source          text not null default 'staff' check (source in ('guest', 'staff')),
  note            text check (length(note) <= 500),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  posted_at       timestamptz,
  void_reason     text,
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete cascade,
  foreign key (tenant_id, service_id) references public.stay_services (tenant_id, id)
);
create index folio_charges_reservation_idx on public.folio_charges (reservation_id, created_at);

alter table public.folio_charges enable row level security;
create policy folio_charges_staff_read on public.folio_charges
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy folio_charges_staff_insert on public.folio_charges
  for insert to authenticated
  with check (public.is_tenant_member(tenant_id) and source = 'staff' and created_by = auth.uid());
create policy folio_charges_staff_update on public.folio_charges
  for update to authenticated
  using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));

-- A charge is never edited once posted, and void is final: void it and add a
-- new one. Stamps posted_at.
create or replace function public.guard_folio_charge()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'posted' then new.posted_at := coalesce(new.posted_at, now()); end if;
    return new;
  end if;
  if old.status = 'void' then
    raise exception 'El cargo está anulado' using errcode = 'check_violation';
  end if;
  if (new.qty, new.unit_price, new.reservation_id, new.tenant_id, new.description)
     is distinct from (old.qty, old.unit_price, old.reservation_id, old.tenant_id, old.description)
     and old.status = 'posted' then
    raise exception 'Un cargo confirmado no se modifica: anúlalo y añade otro' using errcode = 'check_violation';
  end if;
  if new.status = 'void' and coalesce(btrim(new.void_reason), '') = '' then
    raise exception 'Indica el motivo de la anulación' using errcode = 'check_violation';
  end if;
  if new.status = 'posted' and old.status <> 'posted' then new.posted_at := now(); end if;
  return new;
end;
$$;
create trigger folio_charges_guard before insert or update on public.folio_charges
  for each row execute function public.guard_folio_charge();

-- ── Stay extensions ──────────────────────────────────────────────────────────
-- Requested by the guest (priced on the server by the stays-extend function),
-- approved by reception.
create table public.stay_extensions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  reservation_id  uuid not null,
  new_check_out   date not null,
  new_end_at      timestamptz not null,
  nights          integer not null check (nights between 1 and 30),
  amount          numeric(10,2) not null check (amount >= 0),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at    timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid references auth.users(id) on delete set null,
  decision_note   text,
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete cascade
);
create unique index stay_extensions_one_pending on public.stay_extensions (reservation_id) where status = 'pending';
alter table public.stay_extensions enable row level security;
create policy stay_extensions_staff_read on public.stay_extensions
  for select to authenticated using (public.is_tenant_member(tenant_id));

create or replace function public.decide_extension(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare x public.stay_extensions%rowtype;
begin
  select * into x from public.stay_extensions where id = p_id for update;
  if not found or not public.is_tenant_member(x.tenant_id) then
    raise exception 'Solicitud no encontrada' using errcode = 'no_data_found';
  end if;
  if x.status <> 'pending' then
    raise exception 'La solicitud ya está resuelta' using errcode = 'check_violation';
  end if;
  if p_approve then
    begin
      update public.reservations
         set end_at = x.new_end_at,
             base_price = base_price + x.amount,
             total = total + x.amount
       where id = x.reservation_id and status in ('confirmed', 'in_progress')
         and end_at < x.new_end_at;
      if not found then
        raise exception 'La reserva ya no se puede ampliar' using errcode = 'check_violation';
      end if;
    exception when exclusion_violation then
      raise exception 'La habitación ya no está libre en esas fechas' using errcode = 'check_violation';
    end;
  end if;
  update public.stay_extensions
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now(), decided_by = auth.uid(), decision_note = p_note
   where id = x.id;
  insert into public.domain_events (tenant_id, event_type, entity, entity_id, actor_id, payload)
  values (x.tenant_id, case when p_approve then 'extension.approved' else 'extension.rejected' end,
          'reservation', x.reservation_id, auth.uid(),
          jsonb_build_object('nights', x.nights, 'amount', x.amount, 'new_check_out', x.new_check_out));
end;
$$;

-- ── Balance ──────────────────────────────────────────────────────────────────
-- Booking total (room and extras) plus posted charges, minus what was paid.
create or replace function public.folio_balance(p_reservation_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select round(r.total + coalesce((select sum(amount) from public.folio_charges c
                                    where c.reservation_id = r.id and c.status = 'posted'), 0)
               - r.paid_amount, 2)
  from public.reservations r where r.id = p_reservation_id;
$$;

-- The guest's bill (booking token or member account).
create or replace function public.get_folio(p_reservation_id uuid, p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.guest_stay(p_reservation_id, p_token);
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object(
    'reservation_id', r.id,
    'status', r.status,
    'booking_total', r.total,
    'paid', r.paid_amount,
    'balance', public.folio_balance(r.id),
    'charges', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', id, 'category', category, 'description', description, 'qty', qty,
                  'unit_price', unit_price, 'amount', amount, 'status', status,
                  'created_at', created_at) order by created_at)
                from public.folio_charges where reservation_id = r.id and status <> 'void'), '[]'::jsonb),
    'extension', (select jsonb_build_object('id', id, 'new_check_out', new_check_out, 'nights', nights,
                                            'amount', amount, 'status', status)
                    from public.stay_extensions where reservation_id = r.id
                   order by requested_at desc limit 1)
  );
end;
$$;

-- Guest orders a service: a requested charge plus a message to reception.
create or replace function public.order_service(
  p_reservation_id uuid, p_token text, p_service_id uuid, p_qty numeric default 1, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.reservations%rowtype;
  s public.stay_services%rowtype;
  v_id uuid;
begin
  select * into r from public.guest_stay(p_reservation_id, p_token);
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if not public.tenant_feature(r.tenant_id, 'folio') then
    raise exception 'Este hotel no admite pedidos desde la app' using errcode = 'check_violation';
  end if;
  if r.status not in ('confirmed', 'in_progress') then
    raise exception 'Solo durante una estancia confirmada' using errcode = 'check_violation';
  end if;
  select * into s from public.stay_services
   where id = p_service_id and tenant_id = r.tenant_id and active;
  if not found then
    raise exception 'Servicio no disponible' using errcode = 'no_data_found';
  end if;
  if p_qty is null or p_qty <= 0 or p_qty > 20 then
    raise exception 'Cantidad no válida' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.folio_charges
       where reservation_id = r.id and status = 'requested') >= 10 then
    raise exception 'Tienes muchos pedidos pendientes; espera a que recepción los confirme' using errcode = 'check_violation';
  end if;
  insert into public.folio_charges (tenant_id, reservation_id, service_id, category, description, qty,
                                    unit_price, status, source, note)
  values (r.tenant_id, r.id, s.id, s.category, s.name, p_qty, s.price, 'requested', 'guest',
          nullif(btrim(left(p_note, 500)), ''))
  returning id into v_id;
  insert into public.stay_messages (tenant_id, reservation_id, sender, body, category)
  values (r.tenant_id, r.id, 'guest',
          'Pedido: ' || trim(to_char(p_qty, 'FM999990.##')) || ' × ' || s.name
            || coalesce(' — ' || nullif(btrim(left(p_note, 500)), ''), ''),
          case s.category when 'food' then 'room_service' when 'parking' then 'valet' else 'other' end);
  return v_id;
end;
$$;

-- Payment taken at the front desk (cash or card terminal).
create or replace function public.record_desk_payment(p_reservation_id uuid, p_amount numeric, p_method text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.reservations where id = p_reservation_id for update;
  if not found or not public.is_tenant_member(r.tenant_id) then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > greatest(public.folio_balance(r.id), 0) then
    raise exception 'El importe debe estar entre 0 y el saldo pendiente' using errcode = 'check_violation';
  end if;
  if p_method not in ('cash', 'card') then
    raise exception 'Método no válido' using errcode = 'check_violation';
  end if;
  insert into public.payments (tenant_id, reservation_id, provider, provider_ref, amount, status, kind, verified_at, raw_notification)
  values (r.tenant_id, r.id, 'desk', 'desk-' || gen_random_uuid(), p_amount, 'succeeded', 'balance', now(),
          jsonb_build_object('method', p_method, 'staff', auth.uid()));
  update public.reservations set paid_amount = paid_amount + p_amount where id = r.id;
  insert into public.domain_events (tenant_id, event_type, entity, entity_id, actor_id, payload)
  values (r.tenant_id, 'payment.succeeded', 'reservation', r.id, auth.uid(),
          jsonb_build_object('amount', p_amount, 'provider', 'desk', 'method', p_method));
end;
$$;

revoke execute on function public.guard_folio_charge() from public, anon, authenticated;
revoke execute on function public.folio_balance(uuid) from public, anon;
grant execute on function public.folio_balance(uuid) to authenticated, service_role;
revoke execute on function public.decide_extension(uuid, boolean, text) from public, anon;
grant execute on function public.decide_extension(uuid, boolean, text) to authenticated;
revoke execute on function public.get_folio(uuid, text) from public;
grant execute on function public.get_folio(uuid, text) to anon, authenticated;
revoke execute on function public.order_service(uuid, text, uuid, numeric, text) from public;
grant execute on function public.order_service(uuid, text, uuid, numeric, text) to anon, authenticated;
revoke execute on function public.record_desk_payment(uuid, numeric, text) from public, anon;
grant execute on function public.record_desk_payment(uuid, numeric, text) to authenticated;
