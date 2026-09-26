-- ─────────────────────────────────────────────────────────────────────────────
-- Deleting a customer. Bookings reference their customer and must stay (the
-- hotel keeps them for accounting and the traveller register), so:
-- - a customer without bookings is deleted;
-- - a customer with bookings is anonymised (right to erasure): name, contact
--   details, notes and identity data go; the bookings stay, without them.
-- Only hotel admins do it, through delete_customer(); direct deletes of
-- customers are no longer open to reception.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.delete_customer(p_customer_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_bookings integer;
begin
  select tenant_id into v_tenant from public.customers where id = p_customer_id;
  if v_tenant is null or not public.has_tenant_role(v_tenant, 'admin') then
    raise exception 'Cliente no encontrado' using errcode = 'no_data_found';
  end if;
  select count(*) into v_bookings from public.reservations
   where tenant_id = v_tenant and customer_id = p_customer_id;

  if v_bookings = 0 then
    delete from public.customers where id = p_customer_id;
  else
    delete from public.guest_identities where tenant_id = v_tenant and customer_id = p_customer_id;
    update public.customers
       set name = 'Cliente eliminado', email = null, phone = null, notes = null, no_contact = true
     where id = p_customer_id;
  end if;
  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id, payload)
  values (v_tenant, auth.uid(),
          case when v_bookings = 0 then 'customer.deleted' else 'customer.anonymised' end,
          'customer', p_customer_id, jsonb_build_object('bookings', v_bookings));
  return case when v_bookings = 0 then 'deleted' else 'anonymised' end;
end;
$$;

revoke execute on function public.delete_customer(uuid) from public, anon;
grant execute on function public.delete_customer(uuid) to authenticated;

-- Staff keep reading, adding and editing customers; deleting goes through the
-- function above (admins only).
drop policy customers_staff_all on public.customers;
create policy customers_staff_read on public.customers
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy customers_staff_insert on public.customers
  for insert to authenticated with check (public.is_tenant_member(tenant_id));
create policy customers_staff_update on public.customers
  for update to authenticated
  using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
