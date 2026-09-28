-- English versions of the demo hotels' own texts (shown to guests browsing
-- the booking web in English). Loaded after hotel-web.sql; to apply to an
-- existing demo database:
--   node --env-file=.env scripts/sql-apply.mjs supabase/seeds/hotel-web-en.sql
update public.tenants
   set brand = brand || jsonb_build_object(
         'eyebrow_en', 'Hotel Lumen · Urban boutique',
         'tagline_en', 'A boutique hotel in the old town of Valencia',
         'heroTitle_en', 'Sleep in the centre, live the city',
         'heroSubtitle_en', 'Design rooms a short walk from the cathedral and the market, with a rooftop, a breakfast of local produce and a 24-hour front desk.',
         'about_en', 'A 10-room boutique hotel right in the old town, two minutes from the cathedral and the Central Market. A breakfast of local produce, a rooftop with views and a 24-hour front desk.')
 where slug = 'hotel-lumen';

update public.tenants
   set brand = brand || jsonb_build_object(
         'eyebrow_en', 'Albora · Seaside hotel',
         'tagline_en', 'On the Mediterranean, on the Costa Blanca',
         'heroTitle_en', 'The sea a step from your room',
         'heroSubtitle_en', 'Sea-view rooms, a spa, padel and experiences on the bay of Altea. Book direct at the best price.',
         'about_en', 'On the bay of Altea, with sea-view rooms, a spa, padel and experiences for families and couples. A five-minute walk from the old town.')
 where slug = 'albora-hotel-spa';
