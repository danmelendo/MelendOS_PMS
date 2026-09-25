-- ─────────────────────────────────────────────────────────────────────────────
-- Fixes from the Supabase security and performance advisors on the base schema.
-- ─────────────────────────────────────────────────────────────────────────────

-- Trigger functions: pin search_path.
alter function public.set_updated_at() set search_path = public;
alter function public.check_reservation_gap() set search_path = public;
alter function public.check_room_available_for_public() set search_path = public;

-- The RLS helpers are only evaluated in policies for authenticated users and in
-- column defaults of tables anon cannot write, so anon does not need them.
-- (room_busy_windows and validate_promo_code stay public on purpose: they are
-- the public web's availability and promo-code endpoints and return no guest
-- data.)
revoke execute on function public.is_tenant_member(uuid) from anon;
revoke execute on function public.has_tenant_role(uuid, public.staff_role) from anon;
revoke execute on function public.is_member_user(uuid, uuid) from anon;
revoke execute on function public.current_tenant_id() from anon;

-- Evaluate auth.uid() once per statement, not once per row.
drop policy tenant_members_read on public.tenant_members;
create policy tenant_members_read on public.tenant_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_tenant_role(tenant_id, 'admin'));

drop policy members_self_read on public.members;
create policy members_self_read on public.members
  for select to authenticated using (user_id = (select auth.uid()));

-- Index every foreign key that has no index starting with its columns.
do $$
declare
  fk record;
  cols text;
begin
  for fk in
    select c.conrelid::regclass as tbl, c.conname, c.conkey
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public'
  loop
    select string_agg(quote_ident(a.attname), ', ' order by k.ord)
      into cols
    from unnest(fk.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = fk.tbl and a.attnum = k.attnum;

    -- indkey is 0-based and conkey 1-based: rebuild the index prefix as a
    -- regular 1-based array before comparing.
    if not exists (
      select 1 from pg_index i
      where i.indrelid = fk.tbl
        and (
          select array_agg(k.attnum order by k.ord)
          from unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
          where k.ord <= array_length(fk.conkey, 1)
        ) = fk.conkey
    ) then
      execute format('create index %I on %s (%s)', left(fk.conname || '_idx', 63), fk.tbl, cols);
    end if;
  end loop;
end $$;
