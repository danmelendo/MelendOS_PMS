-- Contracted packages of the two demo hotels (see @domain/features.ts).
-- Hotel Lumen (boutique, starter plan): stay + AI + data + distribution, no loyalty club.
-- Albora (resort, pro plan): everything, loyalty club included.
-- Loaded after seed.sql; to apply to an existing demo database:
--   node --env-file=.env scripts/sql-apply.mjs supabase/seeds/tenant-packages.sql
update public.tenants
   set settings = settings || '{"packages": ["stay", "ai", "data", "distribution"]}'::jsonb
 where slug = 'hotel-lumen';

update public.tenants
   set settings = settings || '{"packages": ["stay", "ai", "chain", "data", "distribution"]}'::jsonb
 where slug = 'albora-hotel-spa';
