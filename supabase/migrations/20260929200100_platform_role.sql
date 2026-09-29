-- The "platform" role ("Administrador" in the panel): Melend/OS staff with
-- full control of every hotel, for support and product reviews (Dan,
-- 29/09/2026). platform_admins is the source of truth and only the platform
-- edits it (no policies); triggers keep a 'platform' membership in every
-- hotel, including hotels created later. The hotel sees it in "Equipo" but
-- cannot give, change or remove it. Everything done with it is recorded with
-- its user id like anyone else's (domain_events, audit_log).

create table public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

-- Full control: every role check of a hotel holds for it.
create or replace function public.has_tenant_role(p_tenant uuid, p_role public.staff_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant and user_id = auth.uid()
      and (role = p_role or role = 'platform' or (p_role = 'admin' and role = 'group'))
  ) and public.staff_mfa_ok();
$$;

create or replace function public.is_tenant_staff(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_members
     where tenant_id = p_tenant and user_id = auth.uid() and role in ('admin', 'reception', 'platform')
  ) and public.staff_mfa_ok();
$$;

-- Memberships follow platform_admins…
create or replace function public.sync_platform_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.tenant_members (tenant_id, user_id, role)
    select t.id, new.user_id, 'platform' from public.tenants t
    on conflict (tenant_id, user_id) do update set role = 'platform';
  else
    delete from public.tenant_members where user_id = old.user_id and role = 'platform';
  end if;
  return null;
end;
$$;
revoke execute on function public.sync_platform_admin() from public, anon, authenticated;
create trigger platform_admins_sync
  after insert or delete on public.platform_admins
  for each row execute function public.sync_platform_admin();

-- …and every new hotel gets them.
create or replace function public.add_platform_admins()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_members (tenant_id, user_id, role)
  select new.id, p.user_id, 'platform' from public.platform_admins p
  on conflict (tenant_id, user_id) do update set role = 'platform';
  return null;
end;
$$;
revoke execute on function public.add_platform_admins() from public, anon, authenticated;
create trigger tenants_platform_admins
  after insert on public.tenants
  for each row execute function public.add_platform_admins();

-- Hotels manage their own roles (admin, reception); group management and the
-- platform role are set up by Melend/OS only.
create or replace function public.guard_staff_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := coalesce(new.tenant_id, old.tenant_id);
  v_old text := case when tg_op <> 'INSERT' then old.role::text end;
  v_new text := case when tg_op <> 'DELETE' then new.role::text end;
begin
  -- The platform (service role, cascades, the triggers above) is not limited.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if v_new = 'group' and v_old is distinct from 'group' or v_old = 'group' and v_new is distinct from 'group' then
    raise exception 'El rol de dirección de grupo lo configura Melend/OS' using errcode = 'insufficient_privilege';
  end if;
  if v_new = 'platform' and v_old is distinct from 'platform' or v_old = 'platform' and v_new is distinct from 'platform' then
    raise exception 'El acceso de soporte de Melend/OS no se puede cambiar desde el hotel' using errcode = 'insufficient_privilege';
  end if;
  if v_old = 'admin' and v_new is distinct from 'admin'
     and not exists (select 1 from public.tenant_members
                      where tenant_id = v_tenant and role = 'admin' and user_id <> old.user_id) then
    raise exception 'El hotel tiene que conservar al menos una persona de dirección' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;
