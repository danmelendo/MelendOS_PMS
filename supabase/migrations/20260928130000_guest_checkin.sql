-- Online check-in: the guest fills in the traveller register (SES.HOSPEDAJES)
-- from the booking link, instead of reception typing it at the desk. Same
-- table, same checks and same masking as the panel: the guest can add and
-- correct the guests of the stay but never reads their data back (a leaked
-- link shows names and the last digits of each document, nothing else).
-- The writing is shared by reception and guests (stay_traveller_write).

create or replace function public.stay_traveller_write(
  v_tenant uuid, p_reservation uuid, p_data jsonb, p_id uuid, p_by uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce((p_data->>'is_holder')::boolean, false) then
    update public.stay_travellers set is_holder = false
     where reservation_id = p_reservation and is_holder and id is distinct from p_id;
  end if;
  if p_id is null then
    insert into public.stay_travellers (tenant_id, reservation_id, first_name, updated_by)
    values (v_tenant, p_reservation, coalesce(nullif(btrim(p_data->>'first_name'), ''), '?'), p_by)
    returning id into v_id;
  else
    select id into v_id from public.stay_travellers where id = p_id and reservation_id = p_reservation;
    if v_id is null then
      raise exception 'Viajero no encontrado' using errcode = 'no_data_found';
    end if;
  end if;
  update public.stay_travellers set
    is_holder = case when p_data ? 'is_holder' then coalesce((p_data->>'is_holder')::boolean, false) else is_holder end,
    first_name = case when p_data ? 'first_name' then btrim(p_data->>'first_name') else first_name end,
    last_name1 = case when p_data ? 'last_name1' then nullif(btrim(p_data->>'last_name1'), '') else last_name1 end,
    last_name2 = case when p_data ? 'last_name2' then nullif(btrim(p_data->>'last_name2'), '') else last_name2 end,
    document_type = case when p_data ? 'document_type' then nullif(p_data->>'document_type', '') else document_type end,
    document_number = case when p_data ? 'document_number' then nullif(upper(regexp_replace(p_data->>'document_number', '[\s-]', '', 'g')), '') else document_number end,
    document_support = case when p_data ? 'document_support' then nullif(upper(regexp_replace(p_data->>'document_support', '[\s-]', '', 'g')), '') else document_support end,
    birth_date = case when p_data ? 'birth_date' then nullif(p_data->>'birth_date', '')::date else birth_date end,
    nationality = case when p_data ? 'nationality' then nullif(upper(p_data->>'nationality'), '') else nationality end,
    sex = case when p_data ? 'sex' then nullif(p_data->>'sex', '') else sex end,
    address = case when p_data ? 'address' then nullif(btrim(p_data->>'address'), '') else address end,
    address_extra = case when p_data ? 'address_extra' then nullif(btrim(p_data->>'address_extra'), '') else address_extra end,
    municipality_code = case when p_data ? 'municipality_code' then nullif(btrim(p_data->>'municipality_code'), '') else municipality_code end,
    municipality_name = case when p_data ? 'municipality_name' then nullif(btrim(p_data->>'municipality_name'), '') else municipality_name end,
    postal_code = case when p_data ? 'postal_code' then nullif(btrim(p_data->>'postal_code'), '') else postal_code end,
    country = case when p_data ? 'country' then nullif(upper(p_data->>'country'), '') else country end,
    phone = case when p_data ? 'phone' then nullif(btrim(p_data->>'phone'), '') else phone end,
    phone2 = case when p_data ? 'phone2' then nullif(btrim(p_data->>'phone2'), '') else phone2 end,
    email = case when p_data ? 'email' then nullif(lower(btrim(p_data->>'email')), '') else email end,
    kinship = case when p_data ? 'kinship' then nullif(p_data->>'kinship', '') else kinship end,
    updated_at = now(),
    updated_by = p_by
  where id = v_id;
  -- A blocked report is tried again on the next run.
  update public.ses_communications set status = 'pending'
   where reservation_id = p_reservation and status = 'blocked';
  return v_id;
end;
$$;
revoke execute on function public.stay_traveller_write(uuid, uuid, jsonb, uuid, uuid) from public, anon, authenticated;

create or replace function public.save_stay_traveller(p_reservation uuid, p_data jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.reservations where id = p_reservation;
  if v_tenant is null or not public.is_tenant_staff(v_tenant) then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  return public.stay_traveller_write(v_tenant, p_reservation, p_data, p_id, auth.uid());
end;
$$;

-- The guest (booking link token, or their member session) adds or corrects a
-- guest of an active stay, until check-out. At most 12 guests per stay.
create or replace function public.guest_save_traveller(
  p_reservation uuid, p_token text, p_data jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.guest_stay(p_reservation, p_token);
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if r.status::text not in ('pending', 'confirmed', 'in_progress') or r.end_at < now() then
    raise exception 'El registro de esta estancia ya está cerrado' using errcode = 'check_violation';
  end if;
  if p_id is null and (select count(*) from public.stay_travellers where reservation_id = r.id) >= 12 then
    raise exception 'Máximo 12 viajeros por reserva' using errcode = 'check_violation';
  end if;
  return public.stay_traveller_write(r.tenant_id, r.id, p_data, p_id, auth.uid());
end;
$$;

-- The guests already registered for the stay, masked as in the panel, and
-- what each one still lacks.
create or replace function public.guest_list_travellers(p_reservation uuid, p_token text)
returns table (
  id uuid, is_holder boolean, first_name text, last_name1 text, last_name2 text,
  document_type text, document_hint text, nationality text, is_minor boolean,
  kinship text, missing text[]
) language plpgsql stable security definer set search_path = public as $$
declare r public.reservations%rowtype; v_check_in date;
begin
  select * into r from public.guest_stay(p_reservation, p_token);
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  select (r.start_at at time zone coalesce(t.settings->>'timezone', 'Europe/Madrid'))::date
    into v_check_in from public.tenants t where t.id = r.tenant_id;
  return query
    select s.id, s.is_holder, s.first_name, s.last_name1, s.last_name2, s.document_type,
           case when s.document_number is null then null
                else repeat('•', least(6, greatest(char_length(s.document_number) - 3, 0))) || right(s.document_number, 3) end,
           s.nationality,
           coalesce(s.birth_date > v_check_in - interval '18 years', false),
           s.kinship,
           public.ses_traveller_missing(s, v_check_in)
      from public.stay_travellers s
     where s.reservation_id = r.id
     order by s.is_holder desc, s.created_at;
end;
$$;

revoke execute on function public.guest_save_traveller(uuid, text, jsonb, uuid) from public;
revoke execute on function public.guest_list_travellers(uuid, text) from public;
grant execute on function public.guest_save_traveller(uuid, text, jsonb, uuid) to anon, authenticated;
grant execute on function public.guest_list_travellers(uuid, text) to anon, authenticated;
