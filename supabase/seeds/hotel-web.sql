-- Template web of the two demo hotels: texts and contact (made up). Photos are
-- uploaded from the panel (Admin → Web y dominio).
-- Loaded after seed.sql; to apply to an existing demo database:
--   node --env-file=.env scripts/sql-apply.mjs supabase/seeds/hotel-web.sql
update public.tenants
   set brand = (brand - 'hero_image_url') || jsonb_build_object(
         'about', 'Un hotel boutique de 10 habitaciones en pleno centro histórico, a dos minutos de la catedral y del Mercado Central. Desayuno de producto local, rooftop con vistas y recepción 24 horas.',
         'phone', '+34 960 000 101',
         'email', 'hola@hotellumen.example',
         'address', 'Calle de la Paz 1, 46003 Valencia')
 where slug = 'hotel-lumen';

update public.tenants
   set brand = (brand - 'hero_image_url') || jsonb_build_object(
         'about', 'Frente a la bahía de Altea, con habitaciones con vistas al mar, spa, pádel y experiencias para familias y parejas. A cinco minutos a pie del casco antiguo.',
         'phone', '+34 965 000 202',
         'email', 'hola@albora.example',
         'address', 'Avenida del Mar 10, 03590 Altea (Alicante)')
 where slug = 'albora-hotel-spa';
