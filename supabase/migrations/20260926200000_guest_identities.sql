-- ─────────────────────────────────────────────────────────────────────────────
-- Sensitive guest data (identity document, nationality, birth date, address:
-- what the traveller register asks for), apart from the customer's contact
-- details.
-- - Reception records it at check-in but cannot read it back.
-- - Only hotel admins read it, and only right after signing in again (the
--   session must be at most 10 minutes old: a computer left unattended does
--   not show it). Every read is logged in audit_log.
-- The table has no policies: everything goes through the functions below.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.guest_identities (
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  customer_id      uuid not null,
  document_type    text not null check (document_type in ('dni', 'nie', 'passport', 'other')),
  document_number  text not null check (char_length(btrim(document_number)) between 3 and 30),
  document_country text check (char_length(document_country) = 2),
  nationality      text check (char_length(nationality) = 2),
  birth_date       date check (birth_date between '1900-01-01' and current_date),
  address_line     text check (char_length(address_line) <= 200),
  postal_code      text check (char_length(postal_code) <= 12),
  city             text check (char_length(city) <= 100),
  country          text check (char_length(country) = 2),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id) on delete set null,
  primary key (tenant_id, customer_id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade
);
alter table public.guest_identities enable row level security;
revoke all on public.guest_identities from anon, authenticated;

-- Seconds since the caller signed in (the JWT's authentication time, which
-- token refreshes keep). Null without a session.
create or replace function public.seconds_since_sign_in()
returns numeric language sql stable set search_path = public as $$
  select extract(epoch from now()) - max((a->>'timestamp')::numeric)
    from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) a;
$$;

create or replace function public.is_tenant_staff(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_members
     where tenant_id = p_tenant and user_id = auth.uid() and role in ('admin', 'reception'));
$$;

-- Reception or admins record (or correct) a guest's identity.
create or replace function public.save_guest_identity(p_customer_id uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.customers where id = p_customer_id;
  if v_tenant is null or not public.is_tenant_staff(v_tenant) then
    raise exception 'Cliente no encontrado' using errcode = 'no_data_found';
  end if;
  insert into public.guest_identities as g (
    tenant_id, customer_id, document_type, document_number, document_country, nationality,
    birth_date, address_line, postal_code, city, country, updated_at, updated_by)
  values (
    v_tenant, p_customer_id,
    p_data->>'document_type',
    upper(btrim(p_data->>'document_number')),
    nullif(upper(btrim(p_data->>'document_country')), ''),
    nullif(upper(btrim(p_data->>'nationality')), ''),
    nullif(p_data->>'birth_date', '')::date,
    nullif(btrim(p_data->>'address_line'), ''),
    nullif(btrim(p_data->>'postal_code'), ''),
    nullif(btrim(p_data->>'city'), ''),
    nullif(upper(btrim(p_data->>'country')), ''),
    now(), auth.uid())
  on conflict (tenant_id, customer_id) do update set
    document_type = excluded.document_type,
    document_number = excluded.document_number,
    document_country = excluded.document_country,
    nationality = excluded.nationality,
    birth_date = excluded.birth_date,
    address_line = excluded.address_line,
    postal_code = excluded.postal_code,
    city = excluded.city,
    country = excluded.country,
    updated_at = now(),
    updated_by = auth.uid();
  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id)
  values (v_tenant, auth.uid(), 'guest_identity.saved', 'customer', p_customer_id);
end;
$$;

-- Admins read it right after signing in again; the read is logged.
create or replace function public.get_guest_identity(p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v jsonb;
begin
  select tenant_id into v_tenant from public.customers where id = p_customer_id;
  if v_tenant is null or not public.has_tenant_role(v_tenant, 'admin') then
    raise exception 'Solo dirección puede ver los datos de identidad' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(public.seconds_since_sign_in(), 1e9) > 600 then
    raise exception 'Vuelve a identificarte para ver los datos de identidad' using errcode = '28000';
  end if;
  select to_jsonb(g) - 'tenant_id' - 'updated_by' into v
    from public.guest_identities g
   where g.tenant_id = v_tenant and g.customer_id = p_customer_id;
  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id)
  values (v_tenant, auth.uid(), 'guest_identity.viewed', 'customer', p_customer_id);
  return v;
end;
$$;

-- ── Customer directory for the panel (filterable, no sensitive data) ────────
-- Filtered, sorted and paged in the database (hotels have thousands of
-- customers); `total` is the number of matches before paging.
create or replace function public.customer_directory(
  p_tenant uuid default null,
  p_search text default null,
  p_stay text default 'all',        -- all | in_house | upcoming | guests | never
  p_identity text default 'all',    -- all | registered | missing
  p_sort text default 'recent',     -- recent | name | stays | spent | next
  p_limit integer default 100,
  p_offset integer default 0)
returns table (
  id uuid, tenant_id uuid, name text, email text, phone text, no_contact boolean, notes text,
  created_at timestamptz, stays integer, nights integer, spent numeric,
  last_check_out timestamptz, next_check_in timestamptz, in_house boolean, has_identity boolean,
  total bigint)
language sql stable security definer set search_path = public as $$
  with base as (
    select c.id, c.tenant_id, c.name, c.email, c.phone, c.no_contact, c.notes, c.created_at,
           count(r.id) filter (where r.status in ('confirmed', 'in_progress', 'completed'))::int as stays,
           coalesce(sum(greatest(1, round(extract(epoch from (r.end_at - r.start_at)) / 86400.0)))
                    filter (where r.status in ('in_progress', 'completed')), 0)::int as nights,
           coalesce(sum(r.total) filter (where r.status in ('in_progress', 'completed')), 0) as spent,
           max(r.end_at) filter (where r.status in ('completed', 'in_progress') and r.end_at <= now()) as last_check_out,
           min(r.start_at) filter (where r.status in ('pending', 'confirmed') and r.start_at > now()) as next_check_in,
           coalesce(bool_or(r.status = 'in_progress'), false) as in_house,
           exists (select 1 from public.guest_identities g
                    where g.tenant_id = c.tenant_id and g.customer_id = c.id) as has_identity
      from public.customers c
      left join public.reservations r on r.customer_id = c.id and r.tenant_id = c.tenant_id
     where public.is_tenant_member(c.tenant_id)
       and (p_tenant is null or c.tenant_id = p_tenant)
       and (coalesce(btrim(p_search), '') = ''
            or c.name ilike '%' || btrim(p_search) || '%'
            or c.email ilike '%' || btrim(p_search) || '%'
            or c.phone like '%' || btrim(p_search) || '%')
     group by c.id
  ),
  f as (
    select * from base
     where (p_stay = 'all'
            or (p_stay = 'in_house' and in_house)
            or (p_stay = 'upcoming' and next_check_in is not null)
            or (p_stay = 'guests' and stays > 0)
            or (p_stay = 'never' and stays = 0))
       and (p_identity = 'all'
            or (p_identity = 'registered' and has_identity)
            or (p_identity = 'missing' and not has_identity))
  )
  select f.*, count(*) over () as total
    from f
   order by
     case when p_sort = 'name' then lower(f.name) end asc nulls last,
     case when p_sort = 'stays' then f.stays end desc,
     case when p_sort = 'spent' then f.spent end desc,
     case when p_sort = 'next' then f.next_check_in end asc nulls last,
     f.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500)
   offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.seconds_since_sign_in() from public, anon;
grant execute on function public.seconds_since_sign_in() to authenticated;
revoke execute on function public.is_tenant_staff(uuid) from public, anon;
revoke execute on function public.save_guest_identity(uuid, jsonb) from public, anon;
grant execute on function public.save_guest_identity(uuid, jsonb) to authenticated;
revoke execute on function public.get_guest_identity(uuid) from public, anon;
grant execute on function public.get_guest_identity(uuid) to authenticated;
revoke execute on function public.customer_directory(uuid, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.customer_directory(uuid, text, text, text, text, integer, integer) to authenticated;
