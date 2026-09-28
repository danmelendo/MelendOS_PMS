-- Two-step verification (TOTP) for the hotel's staff. Optional per person
-- (Mi cuenta → Verificación en dos pasos); once someone turns it on, their
-- rights in any hotel only count with a session verified with the second
-- factor (JWT aal2). Enforced here, in the functions every policy uses, not
-- only in the panel: a stolen password or an aal1 token is not enough.
-- Staff without a verified factor are not affected. is_group_only() is left
-- alone: it restricts (group management cannot operate), it grants nothing.

create or replace function public.staff_mfa_ok()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f
                      where f.user_id = auth.uid() and f.status = 'verified');
$$;
revoke execute on function public.staff_mfa_ok() from public, anon, authenticated;

create or replace function public.is_tenant_member(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant and user_id = auth.uid()
  ) and public.staff_mfa_ok();
$$;

create or replace function public.has_tenant_role(p_tenant uuid, p_role public.staff_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant and user_id = auth.uid()
      and (role = p_role or (p_role = 'admin' and role = 'group'))
  ) and public.staff_mfa_ok();
$$;

create or replace function public.is_tenant_staff(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_members
     where tenant_id = p_tenant and user_id = auth.uid() and role in ('admin', 'reception')
  ) and public.staff_mfa_ok();
$$;
