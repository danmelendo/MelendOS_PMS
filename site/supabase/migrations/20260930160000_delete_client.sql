-- Deleting a client from the management panel (30/09/2026, Dan: "no se pueden
-- borrar clientes; pulso el botón y no ocurre nada"). A plain delete failed
-- whenever the client had any invoice (client_invoices is ON DELETE RESTRICT)
-- and almost every client has one: the setup draft is created on its own.
--
-- delete_client(): drafts go with the client (they were never issued); a
-- client with issued, paid or cancelled invoices is kept, because issued
-- invoices must be kept by law: mark it as «Baja» (status 'cancelled').
-- Hotels, links and the access register go with the client (cascade).
create or replace function public.delete_client(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_sales_admin() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.client_invoices where client_id = p_id and status <> 'draft') then
    raise exception 'Tiene facturas emitidas, que hay que conservar: no se puede borrar. Dale de baja.'
      using errcode = 'check_violation';
  end if;
  delete from public.client_invoices where client_id = p_id and status = 'draft';
  delete from public.clients where id = p_id;
  if not found then
    raise exception 'Cliente no encontrado' using errcode = 'no_data_found';
  end if;
end;
$$;
revoke all on function public.delete_client(uuid) from public, anon;
grant execute on function public.delete_client(uuid) to authenticated;
