-- ─────────────────────────────────────────────────────────────────────────────
-- The hotel's web identity and domains (Dan, 28/09/2026: we sell the booking
-- engine embedded in the hotel's own web, on a subdomain first, plus a
-- template web with photos and basic editing).
-- - tenants.domain: the hotel's own (sub)domain for the booking engine, e.g.
--   reservas.suhotel.com (a CNAME to the platform). The frontend resolves the
--   hotel from the host name: this domain first, then <slug>.<platform domain>.
-- - tenants.brand: name shown, colour, texts, logo and photos of the template.
-- - settings.website_url: the hotel's main website ("back to the web").
-- Management edits them only through save_hotel_web(): until now the
-- tenants_admin_update policy let a hotel's admin rewrite its whole row,
-- including plan, status and contracted packages.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists tenants_admin_update on public.tenants;
revoke insert, update, delete, truncate on public.tenants from anon, authenticated;

-- Normalised host names only (lower case, no scheme, no path).
update public.tenants set domain = lower(domain) where domain is not null;
alter table public.tenants
  add constraint tenants_domain_format
  check (domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$');

-- What management can change of its hotel's web. Keys not in p_data are kept;
-- an empty string clears a value.
create or replace function public.save_hotel_web(p_tenant uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t public.tenants%rowtype;
  v_brand jsonb;
  v_domain text;
  v_site text;
  k text;
  v text;
  -- Text fields of the template and their maximum length.
  v_text constant jsonb := '{"short": 40, "eyebrow": 80, "tagline": 160, "heroTitle": 120,
    "heroSubtitle": 400, "about": 2000, "phone": 40, "email": 120, "address": 200,
    "instagram": 200, "facebook": 200}';
  -- Image fields: http(s) URLs (uploads go to the public hotel-media bucket).
  v_images constant text[] := array['logo_url', 'hero_image_url'];
begin
  if not public.has_tenant_role(p_tenant, 'admin') then
    raise exception 'Solo dirección puede cambiar la web del hotel' using errcode = 'insufficient_privilege';
  end if;
  select * into t from public.tenants where id = p_tenant for update;
  v_brand := coalesce(t.brand, '{}'::jsonb);

  for k, v in select key, value from jsonb_each_text(coalesce(p_data->'brand', '{}'::jsonb) - 'gallery') loop
    v := btrim(v);
    if v_text ? k then
      if char_length(v) > (v_text->>k)::int then
        raise exception 'El campo % es demasiado largo (máx. % caracteres)', k, v_text->>k using errcode = 'check_violation';
      end if;
    elsif k = 'accent' then
      if v <> '' and v !~ '^#[0-9a-fA-F]{6}$' then
        raise exception 'El color debe ir en formato #RRGGBB' using errcode = 'check_violation';
      end if;
    elsif k = any (v_images) or k like 'gallery_%' then
      if v <> '' and v !~ '^https?://' then
        raise exception 'La imagen % no es una URL válida', k using errcode = 'check_violation';
      end if;
    else
      raise exception 'Campo desconocido: %', k using errcode = 'check_violation';
    end if;
    v_brand := case when v = '' then v_brand - k else v_brand || jsonb_build_object(k, v) end;
  end loop;
  -- The hero gradient is derived from the colour (the web computes it again).
  if p_data->'brand' ? 'accent' then
    v_brand := v_brand - 'heroAccent';
  end if;
  -- Photo gallery of the template: a list of URLs.
  if p_data->'brand' ? 'gallery' then
    if jsonb_typeof(p_data->'brand'->'gallery') <> 'array'
       or jsonb_array_length(p_data->'brand'->'gallery') > 24
       or exists (select 1 from jsonb_array_elements_text(p_data->'brand'->'gallery') g where g !~ '^https?://') then
      raise exception 'La galería admite hasta 24 imágenes con URL válida' using errcode = 'check_violation';
    end if;
    v_brand := v_brand || jsonb_build_object('gallery', p_data->'brand'->'gallery');
  end if;

  v_domain := t.domain;
  if p_data ? 'domain' then
    -- Accept what people paste: https://Reservas.Hotel.com/ → reservas.hotel.com
    v_domain := nullif(lower(regexp_replace(btrim(p_data->>'domain'), '^https?://|/.*$', '', 'g')), '');
    if v_domain is not null and v_domain !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
      raise exception 'El dominio no es válido (ejemplo: reservas.suhotel.com)' using errcode = 'check_violation';
    end if;
    if v_domain is not null and exists (select 1 from public.tenants where domain = v_domain and id <> p_tenant) then
      raise exception 'Ese dominio ya lo usa otro hotel' using errcode = 'unique_violation';
    end if;
  end if;

  v_site := t.settings->>'website_url';
  if p_data ? 'website_url' then
    v_site := nullif(btrim(p_data->>'website_url'), '');
    if v_site is not null and v_site !~ '^https?://[^\s/$.?#].[^\s]*$' then
      raise exception 'La web del hotel debe empezar por https://' using errcode = 'check_violation';
    end if;
  end if;

  update public.tenants
     set brand = v_brand,
         domain = v_domain,
         settings = case when v_site is null then settings - 'website_url'
                         else settings || jsonb_build_object('website_url', v_site) end
   where id = p_tenant;
  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id, payload)
  values (p_tenant, auth.uid(), 'hotel_web.saved', 'tenants', p_tenant,
          jsonb_build_object('domain', v_domain, 'website_url', v_site));
  return jsonb_build_object('brand', v_brand, 'domain', v_domain, 'website_url', v_site);
end;
$$;
revoke execute on function public.save_hotel_web(uuid, jsonb) from public, anon;
grant execute on function public.save_hotel_web(uuid, jsonb) to authenticated;
