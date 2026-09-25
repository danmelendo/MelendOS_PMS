-- In-stay services of the two demo hotels (fictitious). Loaded after seed.sql;
-- to add them to an existing demo database:
--   node --env-file=.env scripts/sql-apply.mjs supabase/seeds/stay-services.sql
insert into public.stay_services (id, tenant_id, category, name, description, price, unit, sort_order)
select md5(h || '-svc-' || k)::uuid, md5(h)::uuid, category, name, description, price, unit, sort
from (values
  ('lumen', 'breakfast', 'food', 'Desayuno en la habitación', 'Bollería, fruta, zumo y café de especialidad', 18, 'persona', 1),
  ('lumen', 'cheese', 'food', 'Tabla de quesos y vino', 'Quesos valencianos y una copa de vino de la terreta', 28, 'unidad', 2),
  ('lumen', 'minibar-water', 'minibar', 'Minibar · agua mineral', null, 3, 'unidad', 3),
  ('lumen', 'minibar-cava', 'minibar', 'Minibar · benjamín de cava', null, 12, 'unidad', 4),
  ('lumen', 'laundry', 'laundry', 'Lavandería', 'Lavado y secado, entrega en 24 h', 15, 'bolsa', 5),
  ('lumen', 'ironing', 'laundry', 'Planchado', null, 4, 'prenda', 6),
  ('lumen', 'parking', 'parking', 'Parking', 'Plaza en parking concertado a 150 m', 22, 'día', 7),
  ('lumen', 'valet', 'parking', 'Aparcacoches', 'Recogida y entrega del coche en la puerta', 8, 'servicio', 8),
  ('lumen', 'meeting', 'catering', 'Catering para reuniones', 'Café y bollería para la sala de reuniones', 12, 'persona', 9),
  ('albora', 'breakfast', 'food', 'Desayuno en la habitación', 'Desayuno mediterráneo servido en tu terraza', 20, 'persona', 1),
  ('albora', 'dinner', 'food', 'Cena en la terraza', 'Menú de pescado del día con vistas a la bahía', 45, 'persona', 2),
  ('albora', 'picnic', 'catering', 'Picnic para la playa', 'Cesta con bocadillos, fruta y bebidas', 18, 'persona', 3),
  ('albora', 'massage', 'spa', 'Masaje relajante 50 min', null, 70, 'sesión', 4),
  ('albora', 'spa-circuit', 'spa', 'Circuito de spa', 'Piscina climatizada, sauna y baño turco (90 min)', 30, 'persona', 5),
  ('albora', 'minibar-cava', 'minibar', 'Minibar · benjamín de cava', null, 12, 'unidad', 6),
  ('albora', 'laundry', 'laundry', 'Lavandería', 'Lavado y secado, entrega en 24 h', 15, 'bolsa', 7),
  ('albora', 'parking', 'parking', 'Parking del hotel', null, 15, 'día', 8),
  ('albora', 'valet', 'parking', 'Aparcacoches', 'Recogida y entrega del coche en la puerta', 8, 'servicio', 9)
) as s(h, k, category, name, description, price, unit, sort)
where exists (select 1 from public.tenants where id = md5(h)::uuid)
on conflict (id) do nothing;
