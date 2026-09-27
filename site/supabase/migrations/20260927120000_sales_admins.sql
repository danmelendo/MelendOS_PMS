-- ─────────────────────────────────────────────────────────────────────────────
-- Sales admin panel (/admin/ on the website).
--
-- Only people listed in sales_admins can read leads, change their status and
-- notes, or delete one (right to erasure). Nobody else, signed in or not, gets
-- anything: public sign-up is disabled on this project and a user who is not
-- in the list sees no rows. New leads still come only through the leads Edge
-- Function (service role).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.sales_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);
alter table public.sales_admins enable row level security;
revoke all on public.sales_admins from anon, authenticated;
grant select on public.sales_admins to authenticated;
-- An admin can see that they are one (the panel checks it); nobody can add rows
-- from the API: admins are added with SQL.
create policy "own admin row" on public.sales_admins
  for select to authenticated using (user_id = auth.uid());

create or replace function public.is_sales_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sales_admins where user_id = auth.uid());
$$;
revoke all on function public.is_sales_admin() from public, anon;
grant execute on function public.is_sales_admin() to authenticated;

-- Leads: admins read everything, change only status and notes, and can delete.
grant select, delete on public.leads to authenticated;
grant update (status, notes) on public.leads to authenticated;
create policy "admins read leads" on public.leads
  for select to authenticated using (public.is_sales_admin());
create policy "admins update leads" on public.leads
  for update to authenticated using (public.is_sales_admin()) with check (public.is_sales_admin());
create policy "admins delete leads" on public.leads
  for delete to authenticated using (public.is_sales_admin());
