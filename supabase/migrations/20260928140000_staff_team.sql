-- The hotel's team from the panel (Admin → Equipo): management lists its
-- staff with their emails, changes roles, removes people and invites new ones
-- (staff-invite, which creates the account and sends the invitation).
-- Until now staff could only be added with SQL.

-- Staff of a hotel with their email and last sign-in (auth.users is not
-- readable from the client). Management only.
create or replace function public.list_staff(p_tenant uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_tenant_role(p_tenant, 'admin') then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;
  return query
    select m.user_id, u.email::text, m.role::text, m.created_at, u.last_sign_in_at
      from public.tenant_members m
      join auth.users u on u.id = m.user_id
     where m.tenant_id = p_tenant
     order by m.role, u.email;
end;
$$;
revoke execute on function public.list_staff(uuid) from public, anon;
grant execute on function public.list_staff(uuid) to authenticated;

-- Management of one hotel may give the roles of that hotel (admin, reception);
-- "group" is a role of the whole group and is only set up by the platform.
-- A hotel always keeps at least one member of management.
create or replace function public.guard_staff_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := coalesce(new.tenant_id, old.tenant_id);
  v_old text := case when tg_op <> 'INSERT' then old.role::text end;
  v_new text := case when tg_op <> 'DELETE' then new.role::text end;
begin
  -- The platform (service role, cascades) is not limited.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if v_new = 'group' and v_old is distinct from 'group' or v_old = 'group' and v_new is distinct from 'group' then
    raise exception 'El rol de dirección de grupo lo configura Melend/OS' using errcode = 'insufficient_privilege';
  end if;
  if v_old = 'admin' and v_new is distinct from 'admin'
     and not exists (select 1 from public.tenant_members
                      where tenant_id = v_tenant and role = 'admin' and user_id <> old.user_id) then
    raise exception 'El hotel tiene que conservar al menos una persona de dirección' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.guard_staff_changes() from public, anon, authenticated;

create trigger tenant_members_guard
  before insert or update or delete on public.tenant_members
  for each row execute function public.guard_staff_changes();

-- The account of an email, if any (service role only: staff-invite adds an
-- existing account to the hotel instead of inviting it again).
create or replace function public.auth_user_id(p_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;
revoke execute on function public.auth_user_id(text) from public, anon, authenticated;
