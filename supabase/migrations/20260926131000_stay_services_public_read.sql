-- Guests without an account (booking link) read the services catalogue as
-- anon, and anon cannot run is_tenant_member(): one policy per role instead of
-- "active or is_tenant_member(...)", which failed with permission denied.
drop policy stay_services_public_read on public.stay_services;
create policy stay_services_anon_read on public.stay_services
  for select to anon using (active);
create policy stay_services_member_read on public.stay_services
  for select to authenticated using (active or public.is_tenant_member(tenant_id));
