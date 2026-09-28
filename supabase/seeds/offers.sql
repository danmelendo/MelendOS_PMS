-- "Habitaciones en oferta" of the two demo hotels: a date sale (a price rule
-- with a negative %) a few days ahead, and one published promo code each.
-- Idempotent; to apply to an existing demo database:
--   node --env-file=.env scripts/sql-apply.mjs supabase/seeds/offers.sql
insert into public.dynamic_rules (tenant_id, type, name, config, multiplier, active)
select t.id, 'date', s.name,
       jsonb_build_object('from', (current_date + s.start_in)::text,
                          'to', (current_date + s.start_in + s.nights - 1)::text),
       s.pct, true
  from (values ('hotel-lumen', 'Semana de otoño', 14, 7, -15),
               ('albora-hotel-spa', 'Escapada entre semana', 17, 5, -20))
       as s(slug, name, start_in, nights, pct)
  join public.tenants t on t.slug = s.slug
 where not exists (
   select 1 from public.dynamic_rules r
    where r.tenant_id = t.id and r.name = s.name and r.active
      and (r.config->>'to')::date >= current_date);

update public.promo_codes pc
   set published = true,
       headline = coalesce(pc.headline, s.headline)
  from (values ('hotel-lumen', 'OTONO15', 'Otoño en Valencia'),
               ('albora-hotel-spa', 'VERANO15', 'Alarga el verano en Altea'))
       as s(slug, code, headline)
  join public.tenants t on t.slug = s.slug
 where pc.tenant_id = t.id and upper(pc.code) = s.code and not pc.archived;
