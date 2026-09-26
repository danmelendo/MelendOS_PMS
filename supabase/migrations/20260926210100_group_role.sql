-- ─────────────────────────────────────────────────────────────────────────────
-- Group management ("Dirección de grupo"): a member of every hotel of the group
-- with role 'group'. The highest role: it reads everything and manages what an
-- admin manages (rates, rooms, plan, integrations, sensitive data), but it does
-- not run the hotels: no bookings, check-ins, bills, messages or decisions on
-- guests' requests. That is left to each hotel's admins and reception.
-- ─────────────────────────────────────────────────────────────────────────────

-- Admin rights include the group role.
create or replace function public.has_tenant_role(p_tenant uuid, p_role public.staff_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant and user_id = auth.uid()
      and (role = p_role or (p_role = 'admin' and role = 'group'))
  );
$$;

-- True when the caller is in this hotel only as group management.
create or replace function public.is_group_only(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant and user_id = auth.uid() and role = 'group'
  );
$$;

-- Operational tables refuse writes from group management, whatever the path
-- (direct writes under RLS or the security-definer functions reception uses).
-- Guests and the server (service role, no auth.uid()) are not affected.
create or replace function public.forbid_group_operations()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
begin
  if auth.uid() is not null and public.is_group_only(v_tenant) then
    raise exception 'La dirección de grupo solo consulta: la operativa (reservas, cobros, mensajes) la gestiona cada hotel'
      using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'reservations', 'reservation_extras', 'customers', 'folio_charges', 'stay_messages',
    'stay_extensions', 'cancellation_requests', 'guest_identities', 'signatures',
    'space_bookings', 'incidents', 'invoices', 'payments'
  ])
  loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function public.forbid_group_operations()',
      t || '_no_group_operations', t);
  end loop;
end $$;

revoke execute on function public.is_group_only(uuid) from public, anon;
grant execute on function public.is_group_only(uuid) to authenticated;
revoke execute on function public.forbid_group_operations() from public, anon, authenticated;
