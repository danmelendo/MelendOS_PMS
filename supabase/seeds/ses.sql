-- Traveller register (SES.HOSPEDAJES) of the two demo hotels: on, in the
-- simulated environment (answers like the ministry without leaving the
-- server). Landlord and establishment codes are made up.
-- Loaded after seed.sql; to apply to an existing demo database:
--   node --env-file=.env scripts/sql-apply.mjs supabase/seeds/ses.sql
insert into public.ses_settings (tenant_id, enabled, environment, landlord_code, app_name)
select id, true, 'simulated',
       case slug when 'hotel-lumen' then '0000000101' else '0000000202' end,
       'Demo Stays PMS'
  from public.tenants
 where slug in ('hotel-lumen', 'albora-hotel-spa')
on conflict (tenant_id) do update set
  enabled = excluded.enabled, environment = excluded.environment,
  landlord_code = excluded.landlord_code;

insert into public.ses_establishments (tenant_id, property_id, code)
select p.tenant_id, p.id,
       '99' || lpad((row_number() over (order by t.slug, p.sort_order, p.name))::text, 8, '0')
  from public.properties p
  join public.tenants t on t.id = p.tenant_id
 where t.slug in ('hotel-lumen', 'albora-hotel-spa')
on conflict (tenant_id, property_id) do nothing;
