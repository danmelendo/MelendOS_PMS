-- Legal pages of each hotel's booking web (aviso legal, privacy, cookies,
-- booking conditions). The texts are a template filled with what the hotel
-- already has: its fiscal identity (Facturación: name, NIF, address, the same
-- that go on its invoices) and its booking policies. Public: an aviso legal
-- must show who runs the website (LSSI art. 10).
create or replace function public.hotel_legal(p_tenant uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', coalesce(nullif(t.brand->>'name', ''), t.name),
    'legal_name', f.issuer_name,
    'nif', f.issuer_nif,
    'address', coalesce(nullif(f.issuer_address, ''), nullif(t.brand->>'address', '')),
    'email', nullif(t.brand->>'email', ''),
    'phone', nullif(t.brand->>'phone', ''),
    'domain', t.domain,
    'checkin_hour', coalesce((t.settings->>'checkin_hour')::int, 15),
    'checkout_hour', coalesce((t.settings->>'checkout_hour')::int, 12),
    'payment', coalesce(t.settings->'payment', '{}'::jsonb),
    'cancellation', coalesce(t.settings->'cancellation', '{}'::jsonb),
    'loyalty', public.tenant_feature(t.id, 'loyalty'),
    'assistant', public.tenant_feature(t.id, 'ai_agent'))
  from public.tenants t
  left join public.fiscal_settings f on f.tenant_id = t.id
  where t.id = p_tenant and t.status in ('trial', 'active');
$$;
revoke execute on function public.hotel_legal(uuid) from public;
grant execute on function public.hotel_legal(uuid) to anon, authenticated;
