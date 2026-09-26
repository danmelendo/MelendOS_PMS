-- Fictitious identity data (traveller register) for the demo customers who
-- have stayed or are staying: invented document numbers (Spanish ones with a
-- valid check letter, as the format requires), birth dates and addresses.
-- Deterministic (md5 of the customer id). Loaded after seed.sql; to apply to
-- an existing demo database:
--   node --env-file=.env scripts/sql-apply.mjs supabase/seeds/guest-identities.sql
with c as (
  select distinct cu.id, cu.tenant_id,
         ('x' || substr(md5(cu.id::text), 1, 8))::bit(32)::bigint as h1,
         ('x' || substr(md5(cu.id::text), 9, 8))::bit(32)::bigint as h2
    from public.customers cu
    join public.reservations r on r.customer_id = cu.id
   where r.status in ('in_progress', 'completed')
),
n as (
  select c.*,
         (array['ES','ES','ES','ES','ES','ES','ES','FR','DE','GB','IT','NL','PT','US'])[1 + (h1 % 14)::int] as nat,
         10000000 + (h2 % 89999999) as num
    from c
)
insert into public.guest_identities (
  tenant_id, customer_id, document_type, document_number, document_country, nationality,
  birth_date, address_line, postal_code, city, country)
select n.tenant_id, n.id,
       case when n.nat = 'ES' then 'dni' else 'passport' end,
       case when n.nat = 'ES'
            then n.num::text || substr('TRWAGMYFPDXBNJZSQVHLCKE', (n.num % 23)::int + 1, 1)
            else n.nat || lpad((n.num % 10000000)::text, 7, '0') end,
       n.nat, n.nat,
       date '1950-01-01' + (n.h2 % 18000)::int,
       (array['Calle Mayor', 'Avenida del Puerto', 'Calle de la Paz', 'Plaza Nueva',
              'Calle del Sol', 'Paseo Marítimo', 'Calle Colón', 'Avenida de la Estación'])
         [1 + (n.h1 % 8)::int] || ', ' || (1 + n.h2 % 120)::text,
       lpad((1000 + n.h1 % 51000)::text, 5, '0'),
       case n.nat
         when 'ES' then (array['Madrid','Valencia','Sevilla','Bilbao','Zaragoza','Málaga','Murcia','Palma'])[1 + (n.h2 % 8)::int]
         when 'FR' then 'Lyon' when 'DE' then 'Múnich' when 'GB' then 'Mánchester'
         when 'IT' then 'Turín' when 'NL' then 'Utrecht' when 'PT' then 'Oporto' else 'Boston' end,
       n.nat
  from n
on conflict (tenant_id, customer_id) do nothing;
