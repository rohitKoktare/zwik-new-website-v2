-- Supabase Storage bucket for site media — see ARCHITECTURE.md §8.
-- Binary files live here; `public.assets` holds only metadata/references.
--
-- Depends on 0001 for public.is_admin().

insert into storage.buckets (id, name, public)
values ('product-media', 'product-media', true)
on conflict (id) do nothing;

-- Bucket-level limits are enforced by Storage itself, independent of the
-- application. Application-level validation still applies (a client-supplied
-- MIME type is never trusted on its own — DEVELOPMENT_STANDARDS.md §11), but
-- this means a bypassed app check still cannot store a 2 GB executable.
update storage.buckets
set
  file_size_limit = 26214400, -- 25 MiB
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'video/mp4',
    'video/webm'
  ]
where id = 'product-media';

-- Public read: the storefront serves these images to anonymous visitors.
drop policy if exists "product_media_public_read" on storage.objects;
create policy "product_media_public_read" on storage.objects
  for select using (bucket_id = 'product-media');

-- Writes are admin-only. Note these gate the *storage* layer; uploads still go
-- through a server action that authenticates, authorizes and validates first.
drop policy if exists "product_media_admin_insert" on storage.objects;
create policy "product_media_admin_insert" on storage.objects
  for insert with check (bucket_id = 'product-media' and public.is_admin());

drop policy if exists "product_media_admin_update" on storage.objects;
create policy "product_media_admin_update" on storage.objects
  for update using (bucket_id = 'product-media' and public.is_admin())
  with check (bucket_id = 'product-media' and public.is_admin());

drop policy if exists "product_media_admin_delete" on storage.objects;
create policy "product_media_admin_delete" on storage.objects
  for delete using (bucket_id = 'product-media' and public.is_admin());
