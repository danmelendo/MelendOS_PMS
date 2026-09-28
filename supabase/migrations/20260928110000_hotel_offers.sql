-- "Habitaciones en oferta" on the hotel's booking web (Dan, 28/09/2026: it
-- replaces the experiences). Two kinds of offer, both already priced by the
-- booking engine:
-- - sales: active date rules with a negative multiplier (e.g. -15 % from
--   the 12th to the 20th), which lower every room of those nights;
-- - promotions: promo codes the hotel chooses to publish on its web (the
--   guest types the code when booking; codes are private unless published).
--
-- Promo codes were only usable from the panel; the booking engine now takes
-- them too (bookings-create, agent, MCP): validate_promo_code() to price and
-- claim_promo_code() to count the use atomically when the booking is created.

alter table public.promo_codes
  add column published boolean not null default false,
  add column headline text check (char_length(headline) <= 120);

-- The current offers of a hotel, for its public web (no private data: a code
-- only appears when the hotel published it).
create or replace function public.hotel_offers(p_tenant uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', r.name,
               'discount_pct', -r.multiplier,
               'from', greatest((r.config->>'from')::date, current_date),
               'to', (r.config->>'to')::date)
             order by (r.config->>'from')::date)
        from public.dynamic_rules r
       where r.tenant_id = p_tenant and r.active and r.type = 'date' and r.multiplier < 0
         and (r.config->>'to') ~ '^\d{4}-\d{2}-\d{2}$' and (r.config->>'from') ~ '^\d{4}-\d{2}-\d{2}$'
         and (r.config->>'to')::date >= current_date), '[]'::jsonb),
    'promos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', p.code,
               'headline', p.headline,
               'discount_type', p.discount_type,
               'discount_value', p.discount_value,
               'valid_until', p.valid_until)
             order by p.created_at)
        from public.promo_codes p
       where p.tenant_id = p_tenant and p.published and p.active and not p.archived
         and p.valid_from <= now() and (p.valid_until is null or p.valid_until >= now())
         and case when p.single_use then p.times_used < 1
                  when p.max_uses is not null then p.times_used < p.max_uses
                  else true end), '[]'::jsonb))
  where exists (select 1 from public.tenants where id = p_tenant and status in ('trial', 'active'));
$$;
revoke execute on function public.hotel_offers(uuid) from public;
grant execute on function public.hotel_offers(uuid) to anon, authenticated;

-- Counts one use of a promo code if it is still valid (service role only: the
-- booking engine calls it right before creating the reservation). Returns false
-- when the code expired or ran out in the meantime.
create or replace function public.claim_promo_code(p_tenant uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.promo_codes pc
     set times_used = pc.times_used + 1,
         active = case when pc.single_use or (pc.max_uses is not null and pc.times_used + 1 >= pc.max_uses)
                       then false else pc.active end,
         archived = case when pc.single_use or (pc.max_uses is not null and pc.times_used + 1 >= pc.max_uses)
                         then true else pc.archived end
   where pc.id = p_id and pc.tenant_id = p_tenant
     and pc.active and not pc.archived
     and pc.valid_from <= now()
     and (pc.valid_until is null or pc.valid_until >= now())
     and case
           when pc.single_use then pc.times_used < 1
           when pc.max_uses is not null then pc.times_used < pc.max_uses
           else true
         end;
  return found;
end;
$$;
revoke execute on function public.claim_promo_code(uuid, uuid) from public, anon, authenticated;
