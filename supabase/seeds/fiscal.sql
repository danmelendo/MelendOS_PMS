-- VERI*FACTU invoicing of the two demo hotels: on, in the simulated
-- environment (series "P…", no fiscal value). Company names and tax ids are
-- made up (valid check digits, no real company).
-- Loaded after seed.sql; to apply to an existing demo database:
--   node --env-file=.env scripts/sql-apply.mjs supabase/seeds/fiscal.sql
insert into public.fiscal_settings (tenant_id, enabled, environment, issuer_nif, issuer_name, issuer_address,
                                    installation_number, simplified_limit, activated_at)
select id, true, 'simulated',
       case slug when 'hotel-lumen' then 'B12345674' else 'B87654323' end,
       case slug when 'hotel-lumen' then 'Hotel Lumen Valencia S.L.' else 'Albora Hoteles S.L.' end,
       case slug when 'hotel-lumen' then 'Calle de la Paz 1, 46003 Valencia' else 'Avenida del Mar 10, 03590 Altea (Alicante)' end,
       'DEMO-' || left(id::text, 8), 400, now()
  from public.tenants
 where slug in ('hotel-lumen', 'albora-hotel-spa')
on conflict (tenant_id) do nothing;
