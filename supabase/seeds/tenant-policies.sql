-- Payment and cancellation policies of the two demo hotels (fictitious).
-- Loaded after seed.sql; to apply to an existing demo database:
--   node --env-file=.env scripts/sql-apply.mjs supabase/seeds/tenant-policies.sql
update public.tenants
   set settings = settings
     || '{"payment": {"modes": ["prepay", "at_hotel"], "default": "prepay"},
          "cancellation": {"free_hours": 48, "penalty": "first_night"}}'::jsonb
 where slug = 'hotel-lumen';

update public.tenants
   set settings = settings
     || '{"payment": {"modes": ["prepay", "at_hotel"], "default": "prepay"},
          "cancellation": {"free_hours": 168, "penalty": "first_night"}}'::jsonb
 where slug = 'albora-hotel-spa';

-- Terms of the bookings already there, with those policies.
update public.reservations r
   set free_cancellation_until = r.start_at - make_interval(hours => public.hotel_free_cancellation_hours(r.tenant_id)::int),
       late_cancellation_fee = round(r.total / greatest(1, round(extract(epoch from (r.end_at - r.start_at)) / 86400.0)), 2)
  from public.tenants t
 where t.id = r.tenant_id and t.slug in ('hotel-lumen', 'albora-hotel-spa');
