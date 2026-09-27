-- Guests' messages are answered by reception (Dan, 27/09/2026: "no es trabajo
-- de dirección contestar a los clientes por peticiones de servicio"). The
-- hotel's management and group management still read the conversations (the
-- copilot and the reports measure response times), but only reception writes
-- in them and marks them as read.
drop policy if exists stay_messages_staff_write on public.stay_messages;
create policy stay_messages_staff_write on public.stay_messages
  for insert to authenticated
  with check (public.has_tenant_role(tenant_id, 'reception') and sender = 'staff' and staff_id = auth.uid());

drop policy if exists stay_messages_staff_read_mark on public.stay_messages;
create policy stay_messages_staff_read_mark on public.stay_messages
  for update to authenticated
  using (public.has_tenant_role(tenant_id, 'reception'))
  with check (public.has_tenant_role(tenant_id, 'reception'));
