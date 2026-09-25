-- ─────────────────────────────────────────────────────────────────────────────
-- Demo seed: two fictional hotels (tenants). 100 % invented data.
--   Hotel Lumen        city boutique hotel, Valencia
--   Albora Hotel & Spa coastal hotel, Altea
-- Ids are deterministic (md5 of a readable key) so tests can refer to rows.
-- Dates are relative to today, so the demo always has arrivals and departures.
-- Auth users (staff and the demo guest) are created by scripts/seed-auth.mjs.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function pg_temp.sid(k text) returns uuid
language sql immutable as $$ select md5(k)::uuid $$;

-- Check-in / check-out instants for "today + n days" in the hotels' timezone.
create or replace function pg_temp.at_day(n integer, h integer) returns timestamptz
language sql stable as $$
  select ((current_date + n)::timestamp + make_interval(hours => h)) at time zone 'Europe/Madrid'
$$;

-- ── Tenants ──────────────────────────────────────────────────────────────────
insert into public.tenants (id, slug, name, domain, status, plan, brand) values
  (pg_temp.sid('lumen'), 'hotel-lumen', 'Hotel Lumen', 'lumen.demostays.example', 'active', 'starter',
   '{"short":"Lumen","accent":"#1F3A5F","heroAccent":"214 51% 25%","eyebrow":"Hotel Lumen · Boutique urbano",
     "tagline":"Un hotel boutique en el centro histórico de Valencia",
     "heroTitle":"Duerme en el centro, vive la ciudad",
     "heroSubtitle":"Habitaciones de diseño a un paseo de la catedral y el mercado, con rooftop, desayuno de producto local y atención 24 h."}'),
  (pg_temp.sid('albora'), 'albora-hotel-spa', 'Albora Hotel & Spa', 'albora.demostays.example', 'active', 'pro',
   '{"short":"Albora","accent":"#0F6E8C","heroAccent":"194 81% 30%","eyebrow":"Albora · Hotel de costa",
     "tagline":"Frente al Mediterráneo, en la Costa Blanca",
     "heroTitle":"El mar a un paso de tu habitación",
     "heroSubtitle":"Habitaciones con vistas al mar, spa, pádel y experiencias en la bahía de Altea. Reserva directa al mejor precio."}');

insert into public.provinces (id, tenant_id, name, accent, tagline) values
  (pg_temp.sid('lumen-prov'), pg_temp.sid('lumen'), 'Comunitat Valenciana', '214 51% 25%', 'Centro histórico y Mediterráneo'),
  (pg_temp.sid('albora-prov'), pg_temp.sid('albora'), 'Costa Blanca', '194 81% 30%', 'Calas, sol y pueblos blancos');

insert into public.properties (id, tenant_id, province_id, name, city, address, rating, amenities, description, brand) values
  (pg_temp.sid('lumen-prop'), pg_temp.sid('lumen'), pg_temp.sid('lumen-prov'), 'Hotel Lumen', 'Valencia',
   'Calle de las Flores, 12', 4.8, '{wifi,rooftop,bar,gym,petfriendly}',
   'Hotel boutique de 10 habitaciones en el centro histórico, con rooftop y desayuno de producto local.', 'urban'),
  (pg_temp.sid('albora-prop'), pg_temp.sid('albora'), pg_temp.sid('albora-prov'), 'Albora Hotel & Spa', 'Altea',
   'Paseo del Mediterráneo, 30', 4.7, '{wifi,spa,pool,restaurant,beach,parking}',
   'Hotel de costa frente a la bahía de Altea, con spa, pádel y habitaciones con vistas al mar.', 'coast');

-- ── Rates ────────────────────────────────────────────────────────────────────
-- [key, name, weekday price, weekend price]; Albora is 10 % dearer (sea).
with groups(k, name, price, weekend) as (values
  ('economy', 'Económica', 75, 90),
  ('single', 'Individual', 85, 102),
  ('standard', 'Estándar', 105, 128),
  ('classic', 'Clásica', 110, 132),
  ('superior', 'Superior', 120, 145),
  ('deluxe', 'Deluxe', 135, 165),
  ('suite', 'Junior Suite', 195, 235),
  ('family', 'Familiar', 150, 182)
), hotels(h, factor) as (values ('lumen', 1.0), ('albora', 1.1)),
ins as (
  insert into public.rate_groups (id, tenant_id, name)
  select pg_temp.sid(h || '-rg-' || k), pg_temp.sid(h), name from groups, hotels
  returning id
)
insert into public.rate_nightly (tenant_id, rate_group_id, price, weekend_price)
select pg_temp.sid(h), pg_temp.sid(h || '-rg-' || k), round(price * factor), round(weekend * factor)
from groups, hotels;

-- ── Rooms ────────────────────────────────────────────────────────────────────
with defs(h, building, num, rg, cap) as (values
  ('lumen', 'Lumen', '101', 'standard', 2), ('lumen', 'Lumen', '102', 'standard', 2),
  ('lumen', 'Lumen', '103', 'single', 1), ('lumen', 'Lumen', '104', 'economy', 2),
  ('lumen', 'Lumen', '201', 'superior', 2), ('lumen', 'Lumen', '202', 'superior', 2),
  ('lumen', 'Lumen', '203', 'deluxe', 2), ('lumen', 'Lumen', '204', 'deluxe', 2),
  ('lumen', 'Lumen', '301', 'suite', 2), ('lumen', 'Lumen', '302', 'family', 4),
  ('albora', 'Albora', '101', 'economy', 2), ('albora', 'Albora', '102', 'classic', 2),
  ('albora', 'Albora', '103', 'classic', 2), ('albora', 'Albora', '104', 'standard', 2),
  ('albora', 'Albora', '201', 'superior', 2), ('albora', 'Albora', '202', 'superior', 2),
  ('albora', 'Albora', '203', 'deluxe', 2), ('albora', 'Albora', '204', 'deluxe', 3),
  ('albora', 'Albora', '301', 'suite', 2), ('albora', 'Albora', '302', 'family', 4),
  ('albora', 'Albora', '303', 'family', 4)
)
insert into public.rooms (id, tenant_id, property_id, building, name, capacity, asset_type, features,
                          rate_group_id, image_url, sort_order)
select
  pg_temp.sid(h || '-room-' || num), pg_temp.sid(h), pg_temp.sid(h || '-prop'), building, num, cap,
  (case rg when 'suite' then 'suite' when 'family' then 'family' else 'room' end)::public.room_category,
  array_remove(array[
    'wifi', 'ac',
    case when h = 'albora' and left(num, 1)::int >= 2 then 'sea_view' end,
    case when h = 'albora' and left(num, 1)::int >= 2 then 'balcony' end,
    case when h = 'albora' and left(num, 1)::int = 1 then 'garden_view' end,
    case when h = 'lumen' and left(num, 1)::int >= 2 then 'city_view' end,
    case when h = 'lumen' and left(num, 1)::int >= 3 then 'terrace' end,
    case when rg in ('deluxe', 'suite') then 'bathtub' end,
    case when rg in ('deluxe', 'suite') then 'minibar' end,
    case when rg = 'family' then 'sofa_bed' end
  ], null),
  pg_temp.sid(h || '-rg-' || rg),
  '/imagenes/rooms/' || h || '-' ||
    case when rg in ('suite', 'family', 'deluxe', 'superior') then rg else 'standard' end || '.svg',
  row_number() over (partition by h order by num)
from defs;

-- ── Extras, gifts, dynamic rules, promo codes ────────────────────────────────
with defs(k, category, name, price, description, sort) as (values
  ('breakfast', 'breakfast', 'Desayuno buffet', 18, 'Por persona y día, de 7:30 a 11:00.', 1),
  ('breakfast-room', 'breakfast', 'Desayuno en la habitación', 24, 'Por persona y día.', 2),
  ('parking', 'parking', 'Parking', 22, 'Por noche, plaza cubierta.', 3),
  ('transfer', 'parking', 'Traslado al aeropuerto', 45, 'Trayecto en coche privado.', 4),
  ('spa', 'wellness', 'Circuito spa', 30, 'Acceso de 90 minutos por persona.', 5),
  ('massage', 'wellness', 'Masaje relajante', 65, '50 minutos.', 6),
  ('late-checkout', 'experiences', 'Late checkout (15:00)', 35, 'Salida hasta las 15:00, sujeto a disponibilidad.', 7),
  ('welcome', 'experiences', 'Detalle de bienvenida', 25, 'Botella de vino local y fruta en la habitación.', 8),
  ('service', 'services', 'Servicio personalizado', 0, 'Precio fijado por recepción.', 9)
), hotels(h) as (values ('lumen'), ('albora'))
insert into public.extras (id, tenant_id, category, name, price, description, sort_order)
select pg_temp.sid(h || '-ex-' || k), pg_temp.sid(h), category::public.extra_category, name, price, description, sort
from defs, hotels;

insert into public.gift_thresholds (tenant_id, min_extras_total, gift_extra_id) values
  (pg_temp.sid('lumen'), 80, pg_temp.sid('lumen-ex-late-checkout')),
  (pg_temp.sid('albora'), 80, pg_temp.sid('albora-ex-late-checkout'));

insert into public.dynamic_rules (tenant_id, type, name, config, multiplier, active) values
  (pg_temp.sid('lumen'), 'occupancy', 'Alta ocupación', '{"threshold":70}', 15, false),
  (pg_temp.sid('lumen'), 'date', 'Fallas', '{"from":"2027-03-15","to":"2027-03-19"}', 30, true),
  (pg_temp.sid('albora'), 'occupancy', 'Alta ocupación', '{"threshold":70}', 15, false),
  (pg_temp.sid('albora'), 'date', 'Temporada alta', '{"from":"2027-07-01","to":"2027-08-31"}', 25, true);

insert into public.promo_codes (tenant_id, code, discount_type, discount_value, single_use, max_uses, times_used) values
  (pg_temp.sid('lumen'), 'BIENVENIDA10', 'fixed', 10, true, 1, 0),
  (pg_temp.sid('lumen'), 'OTONO15', 'percent', 15, false, null, 3),
  (pg_temp.sid('albora'), 'VERANO15', 'percent', 15, false, null, 4);

-- ── Loyalty club (per tenant) ────────────────────────────────────────────────
with tiers(k, name, min_points, ppe, perks, sort) as (values
  ('bronce', 'Bronce', 0, 1.0, '{"1 punto por €","Check-in exprés"}', 0),
  ('plata', 'Plata', 500, 1.25, '{"1,25 puntos por €","Late checkout 13:00","Wifi premium"}', 1),
  ('oro', 'Oro', 1500, 1.5, '{"1,5 puntos por €","Upgrade según disponibilidad","Desayuno incluido"}', 2),
  ('platino', 'Platino', 4000, 2.0, '{"2 puntos por €","Upgrade garantizado","Atención VIP 24/7"}', 3)
), hotels(h) as (values ('lumen'), ('albora'))
insert into public.loyalty_tiers (id, tenant_id, name, min_points, points_per_euro, perks, sort_order)
select pg_temp.sid(h || '-tier-' || k), pg_temp.sid(h), name, min_points, ppe, perks::text[], sort from tiers, hotels;

with defs(name, cost, category, description, sort) as (values
  ('Late checkout 14:00', 300, 'estancia', 'Sal con calma: salida ampliada hasta las 14:00.', 0),
  ('Botella de bienvenida', 450, 'extra', 'Cava frío esperándote en la habitación.', 1),
  ('Upgrade de habitación', 900, 'estancia', 'Sube de categoría según disponibilidad al llegar.', 2),
  ('Noche de regalo', 2500, 'estancia', 'Una noche gratis en el hotel.', 3)
), hotels(h) as (values ('lumen'), ('albora'))
insert into public.rewards (tenant_id, name, cost_points, category, description, sort_order)
select pg_temp.sid(h), name, cost, category, description, sort from defs, hotels;

-- ── Facilities and experiences ───────────────────────────────────────────────
insert into public.common_spaces (id, tenant_id, property_id, name, kind, capacity, description, open_hour, close_hour, price_per_hour, sort_order) values
  (pg_temp.sid('lumen-cs-rooftop'), pg_temp.sid('lumen'), pg_temp.sid('lumen-prop'), 'Rooftop', 'rooftop', 12, 'Mesa reservada con vistas a los tejados del centro.', 17, 24, 0, 0),
  (pg_temp.sid('lumen-cs-meeting'), pg_temp.sid('lumen'), pg_temp.sid('lumen-prop'), 'Sala de reuniones', 'meeting', 10, 'Pantalla, videollamada y café incluidos.', 8, 20, 25, 1),
  (pg_temp.sid('lumen-cs-gym'), pg_temp.sid('lumen'), pg_temp.sid('lumen-prop'), 'Gimnasio', 'gym', 6, 'Cardio y peso libre, abierto a huéspedes.', 7, 23, 0, 2),
  (pg_temp.sid('albora-cs-spa'), pg_temp.sid('albora'), pg_temp.sid('albora-prop'), 'Circuito spa', 'spa', 8, 'Piscina termal, sauna y baño turco.', 10, 21, 30, 0),
  (pg_temp.sid('albora-cs-padel'), pg_temp.sid('albora'), pg_temp.sid('albora-prop'), 'Pista de pádel', 'padel', 4, 'Pista panorámica; palas y bolas en recepción.', 8, 22, 12, 1),
  (pg_temp.sid('albora-cs-pool'), pg_temp.sid('albora'), pg_temp.sid('albora-prop'), 'Piscina exterior', 'pool', 40, 'Tumbona reservada junto a la piscina.', 10, 20, 0, 2);

insert into public.experiences (tenant_id, property_id, title, summary, category, starts_at, location, capacity, attending) values
  (pg_temp.sid('lumen'), pg_temp.sid('lumen-prop'), 'Cata de vinos valencianos', 'Cuatro vinos de la D.O. con quesos locales', 'gastronomy', pg_temp.at_day(2, 20), 'Bar del lobby', 16, 11),
  (pg_temp.sid('lumen'), pg_temp.sid('lumen-prop'), 'Ruta guiada por el casco antiguo', 'Paseo de dos horas con guía oficial', 'culture', pg_temp.at_day(3, 10), 'Salida desde recepción', 20, 14),
  (pg_temp.sid('lumen'), pg_temp.sid('lumen-prop'), 'Sunset en el rooftop', 'DJ y cócteles de autor al atardecer', 'gastronomy', pg_temp.at_day(5, 19), 'Rooftop', 60, 38),
  (pg_temp.sid('lumen'), pg_temp.sid('lumen-prop'), 'Yoga en la terraza', 'Sesión suave para todos los niveles', 'wellness', pg_temp.at_day(6, 8), 'Rooftop', 14, 6),
  (pg_temp.sid('lumen'), pg_temp.sid('lumen-prop'), 'Ruta en bici por el antiguo cauce del río', 'Bicis incluidas, ritmo tranquilo', 'outdoor', pg_temp.at_day(8, 10), 'Salida desde recepción', 12, 7),
  (pg_temp.sid('albora'), pg_temp.sid('albora-prop'), 'Paella en la playa', 'Show cooking con el chef del hotel', 'gastronomy', pg_temp.at_day(1, 13), 'Chiringuito Albora', 40, 29),
  (pg_temp.sid('albora'), pg_temp.sid('albora-prop'), 'Kayak al amanecer', 'Travesía guiada por la bahía', 'outdoor', pg_temp.at_day(3, 8), 'Embarcadero', 12, 9),
  (pg_temp.sid('albora'), pg_temp.sid('albora-prop'), 'Ritual de spa en pareja', 'Circuito termal y masaje de 30 min', 'wellness', pg_temp.at_day(4, 17), 'Spa Albora', 8, 5),
  (pg_temp.sid('albora'), pg_temp.sid('albora-prop'), 'Taller infantil de castillos de arena', 'Para peques de 4 a 10 años', 'family', pg_temp.at_day(5, 11), 'Playa del hotel', 20, 12),
  (pg_temp.sid('albora'), pg_temp.sid('albora-prop'), 'Visita al casco antiguo de Altea', 'Paseo por las calles blancas y el mirador', 'culture', pg_temp.at_day(7, 18), 'Salida desde recepción', 18, 10);

-- ── Payment gateways (test mode; secrets go to Vault in the payments step) ───
insert into public.payment_accounts (tenant_id, provider, test_mode, public_config, secret_name) values
  (pg_temp.sid('lumen'), 'redsys', true, '{"merchant_code":"999008881","terminal":"1","environment":"test"}', 'payments/lumen/redsys'),
  (pg_temp.sid('albora'), 'stripe', true, '{"environment":"test"}', 'payments/albora/stripe');

-- ── Guests and reservations around today ─────────────────────────────────────
insert into public.customers (id, tenant_id, name, phone, email, no_contact, notes) values
  (pg_temp.sid('lumen-c1'), pg_temp.sid('lumen'), 'Laura Gómez', '+34 600 111 222', 'laura@example.com', false, null),
  (pg_temp.sid('lumen-c2'), pg_temp.sid('lumen'), 'Carlos Ruiz', '+34 600 333 444', 'carlos@example.com', false, null),
  (pg_temp.sid('lumen-c3'), pg_temp.sid('lumen'), 'Elena Martín', null, 'elena@example.com', true, 'Prefiere no recibir contacto.'),
  (pg_temp.sid('albora-c1'), pg_temp.sid('albora'), 'María López', '+34 600 555 666', 'maria@example.com', false, 'Cliente habitual.'),
  (pg_temp.sid('albora-c2'), pg_temp.sid('albora'), 'David Sanz', '+34 600 777 888', 'david@example.com', false, null);

-- [key, tenant, room, customer, from day, to day, status, base, extras, people, role, paid]
with defs(k, h, room, cust, d_from, d_to, status, base, extras, people, role, paid) as (values
  ('r1', 'lumen', '203', 'c1', -2, 0, 'completed', 270, 44, 2, 'reception', true),
  ('r2', 'lumen', '101', 'c2', -1, 1, 'in_progress', 210, 72, 2, 'public', true),
  ('r3', 'lumen', '302', 'c1', 0, 2, 'confirmed', 300, 0, 3, 'admin', true),
  ('r4', 'lumen', '202', 'c3', 1, 4, 'confirmed', 365, 0, 2, 'public', true),
  ('r5', 'lumen', '102', null, 2, 3, 'pending', 105, 0, 2, 'public', false),
  ('r6', 'albora', '201', 'c1', 0, 3, 'confirmed', 396, 55, 2, 'public', true),
  ('r7', 'albora', '302', 'c2', 0, 2, 'confirmed', 330, 0, 4, 'reception', true),
  ('r8', 'albora', '203', 'c1', -4, -2, 'completed', 297, 130, 2, 'public', true)
)
insert into public.reservations (
  id, tenant_id, room_id, property_id, customer_id, start_at, end_at, people, base_price,
  extras_total, total, deposit_amount, deposit_paid, paid_amount, status, created_by_role,
  manual_override, created_at
)
select
  pg_temp.sid(h || '-res-' || k), pg_temp.sid(h), pg_temp.sid(h || '-room-' || room), pg_temp.sid(h || '-prop'),
  case when cust is null then null else pg_temp.sid(h || '-' || cust) end,
  pg_temp.at_day(d_from, 15), pg_temp.at_day(d_to, 12), people, base, extras, base + extras,
  round((base + extras) * 0.3, 2), paid, case when paid then round((base + extras) * 0.3, 2) else 0 end,
  status::public.reservation_status, role, role = 'admin',
  case when status = 'pending' then now() - interval '10 minutes' else pg_temp.at_day(d_from - 20, 10) end
from defs;

-- ── Demo guest account (linked to an auth user by scripts/seed-auth.mjs) ─────
insert into public.members (id, tenant_id, name, email, phone, member_number) values
  (pg_temp.sid('lumen-member-alex'), pg_temp.sid('lumen'), 'Alex Río', 'alex@guest.demostays.example', '+34 600 123 456', 'LUM-0042'),
  (pg_temp.sid('albora-member-alex'), pg_temp.sid('albora'), 'Alex Río', 'alex@guest.demostays.example', '+34 600 123 456', 'ALB-0107');

insert into public.loyalty_accounts (tenant_id, member_id, points, lifetime_points, tier_id, member_since) values
  (pg_temp.sid('lumen'), pg_temp.sid('lumen-member-alex'), 740, 1240, pg_temp.sid('lumen-tier-plata'), now() - interval '200 days'),
  (pg_temp.sid('albora'), pg_temp.sid('albora-member-alex'), 120, 120, pg_temp.sid('albora-tier-bronce'), now() - interval '30 days');

-- Past stay at Lumen and upcoming stay at Albora, both booked from the guest app.
insert into public.reservations (
  id, tenant_id, room_id, property_id, member_id, start_at, end_at, people, base_price, total,
  deposit_amount, deposit_paid, paid_amount, status, created_by_role, created_at
) values
  (pg_temp.sid('lumen-res-alex-past'), pg_temp.sid('lumen'), pg_temp.sid('lumen-room-202'), pg_temp.sid('lumen-prop'),
   pg_temp.sid('lumen-member-alex'), pg_temp.at_day(-21, 15), pg_temp.at_day(-20, 12), 2, 120, 120, 36, true, 36,
   'completed', 'member', pg_temp.at_day(-28, 12)),
  (pg_temp.sid('albora-res-alex-next'), pg_temp.sid('albora'), pg_temp.sid('albora-room-201'), pg_temp.sid('albora-prop'),
   pg_temp.sid('albora-member-alex'), pg_temp.at_day(14, 15), pg_temp.at_day(15, 12), 2, 132, 132, 39.6, true, 39.6,
   'confirmed', 'member', now());

insert into public.signatures (tenant_id, reservation_id, doc_type, signer_name, status, signed_at) values
  (pg_temp.sid('lumen'), pg_temp.sid('lumen-res-alex-past'), 'guest_registration', 'Alex Río', 'signed', pg_temp.at_day(-21, 15));

insert into public.loyalty_transactions (tenant_id, member_id, type, points, reason, reservation_id, created_at) values
  (pg_temp.sid('lumen'), pg_temp.sid('lumen-member-alex'), 'earn', 500, 'Bono de bienvenida', null, now() - interval '200 days'),
  (pg_temp.sid('lumen'), pg_temp.sid('lumen-member-alex'), 'earn', 390, 'Estancias anteriores', null, now() - interval '120 days'),
  (pg_temp.sid('lumen'), pg_temp.sid('lumen-member-alex'), 'redeem', -300, 'Canje · Late checkout 14:00', null, now() - interval '40 days'),
  (pg_temp.sid('lumen'), pg_temp.sid('lumen-member-alex'), 'earn', 150, 'Estancia · Hotel Lumen', pg_temp.sid('lumen-res-alex-past'), pg_temp.at_day(-20, 12)),
  (pg_temp.sid('albora'), pg_temp.sid('albora-member-alex'), 'earn', 120, 'Estancia confirmada', pg_temp.sid('albora-res-alex-next'), now());

insert into public.invoices (tenant_id, member_id, number, concept, property_name, issued_at, due_at, net, tax, amount, status) values
  (pg_temp.sid('lumen'), pg_temp.sid('lumen-member-alex'), 'LUM-2026-0412', 'Estancia · 1 noche · hab. 202', 'Hotel Lumen', current_date - 20, current_date - 20, 109.09, 10.91, 120, 'paid'),
  (pg_temp.sid('albora'), pg_temp.sid('albora-member-alex'), 'ALB-2026-0457', 'Señal reserva · hab. 201', 'Albora Hotel & Spa', current_date, current_date, 36.00, 3.60, 39.60, 'paid');

insert into public.incidents (tenant_id, member_id, property_name, category, title, description, status, created_at, updates) values
  (pg_temp.sid('lumen'), pg_temp.sid('lumen-member-alex'), 'Hotel Lumen', 'housekeeping', 'Almohada extra y toallas',
   '¿Podéis subir una almohada firme y dos toallas más a la 202?', 'resolved', pg_temp.at_day(-21, 17),
   '[{"status":"resolved","note":"Entregado en la habitación."},{"status":"open","note":"Petición recibida. Recepción la gestionará en breve."}]');

insert into public.space_bookings (tenant_id, member_id, space_id, date, start_hour, end_hour, guests, total) values
  (pg_temp.sid('albora'), pg_temp.sid('albora-member-alex'), pg_temp.sid('albora-cs-spa'), current_date + 15, 17, 19, 2, 60);
