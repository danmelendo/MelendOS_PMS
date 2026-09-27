-- Photos of each hotel's template web (logo, cover, gallery): a public bucket,
-- one folder per hotel (<tenant id>/…). Anyone can see them (they are on the
-- hotel's web); only the hotel's management uploads, replaces or deletes, and
-- only in its own folder. Images only, up to 5 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hotel-media', 'hotel-media', true, 5 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The hotel a path belongs to, if its first folder is a hotel's id.
create or replace function public.hotel_media_tenant(p_name text)
returns uuid language sql immutable set search_path = public as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;

drop policy if exists hotel_media_insert on storage.objects;
create policy hotel_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hotel-media'
              and public.has_tenant_role(public.hotel_media_tenant(name), 'admin'));
drop policy if exists hotel_media_update on storage.objects;
create policy hotel_media_update on storage.objects for update to authenticated
  using (bucket_id = 'hotel-media' and public.has_tenant_role(public.hotel_media_tenant(name), 'admin'))
  with check (bucket_id = 'hotel-media' and public.has_tenant_role(public.hotel_media_tenant(name), 'admin'));
drop policy if exists hotel_media_delete on storage.objects;
create policy hotel_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hotel-media' and public.has_tenant_role(public.hotel_media_tenant(name), 'admin'));
-- Listing a hotel's own folder (the panel's gallery picker); the files
-- themselves are served publicly by URL.
drop policy if exists hotel_media_select on storage.objects;
create policy hotel_media_select on storage.objects for select to authenticated
  using (bucket_id = 'hotel-media' and public.is_tenant_member(public.hotel_media_tenant(name)));
