-- assets + product_assets — see docs/DATABASE_DESIGN.md §6-7.
-- Binary files live in Supabase Storage; this table stores metadata/references only.

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_bucket text not null default 'product-media',
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text not null,
  width integer check (width > 0),
  height integer check (height > 0),
  duration_seconds numeric check (duration_seconds >= 0),
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  alt_text text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assets_media_type_idx on public.assets (media_type);
create index if not exists assets_status_idx on public.assets (status);
create index if not exists assets_created_at_idx on public.assets (created_at);
create index if not exists assets_created_by_idx on public.assets (created_by);

alter table public.assets enable row level security;

create policy "assets_public_read" on public.assets
  for select using (status = 'active');

create policy "assets_admin_all" on public.assets
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.product_assets (
  product_id uuid not null references public.products (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete restrict,
  role text not null default 'gallery' check (role in ('main', 'gallery', 'thumbnail', 'video')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (product_id, asset_id)
);

create index if not exists product_assets_product_sort_idx
  on public.product_assets (product_id, sort_order);
create index if not exists product_assets_asset_idx on public.product_assets (asset_id);

alter table public.product_assets enable row level security;

create policy "product_assets_public_read" on public.product_assets
  for select using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.is_active = true
    )
  );

create policy "product_assets_admin_all" on public.product_assets
  for all using (public.is_admin()) with check (public.is_admin());
