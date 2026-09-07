-- ZWIK — all migrations concatenated for one-shot execution.
-- Generated from supabase/migrations/*.sql. Idempotent: safe to re-run.
-- Paste into the Supabase Dashboard SQL Editor and Run.
-- Source of truth remains the individual files; do not edit this one.

-- ============================================================
-- 0001_profiles.sql
-- ============================================================
-- profiles: application-level user/admin info linked to Supabase Auth.
-- See docs/DATABASE_DESIGN.md §3.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'ADMIN'
    check (role in ('SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

alter table public.profiles enable row level security;

-- A user may read their own profile (needed for the admin auth check itself).
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- No insert/update/delete policy: profile provisioning is a privileged,
-- server-side (service-role) operation, not something any authenticated
-- user can do to themselves or others.

-- Shared helper used by every other table's admin-write RLS policy, so the
-- "is this caller an active admin" check lives in one place.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active = true
      and role in ('SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER')
  );
$$;

-- ============================================================
-- 0002_categories.sql
-- ============================================================
-- categories — see docs/DATABASE_DESIGN.md §4.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists categories_active_sort_idx
  on public.categories (is_active, sort_order);

alter table public.categories enable row level security;

create policy "categories_public_read" on public.categories
  for select using (is_active = true);

create policy "categories_admin_all" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 0003_products.sql
-- ============================================================
-- products — see docs/DATABASE_DESIGN.md §5.
-- amazon_url is kept for schema compatibility with the documented Amazon-redirect
-- model, but is currently unused: the site runs on a WhatsApp cart-order flow
-- instead (see docs conflict note in the implementation report). Nullable, no UI
-- reads it yet.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  asin text unique,
  name text not null,
  slug text not null unique,
  short_description text,
  description text,
  features jsonb not null default '[]'::jsonb,
  category_id uuid references public.categories (id) on delete restrict,
  price numeric(12, 2) not null check (price >= 0),
  original_price numeric(12, 2) check (original_price >= 0),
  currency text not null default 'INR',
  amazon_url text,
  rating numeric(2, 1) check (rating >= 0 and rating <= 5),
  review_count integer not null default 0 check (review_count >= 0),
  is_featured boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_active_sort_idx on public.products (is_active, sort_order);
create index if not exists products_featured_active_idx on public.products (is_featured, is_active);
create index if not exists products_category_active_idx on public.products (category_id, is_active);
create index if not exists products_slug_idx on public.products (slug);

alter table public.products enable row level security;

create policy "products_public_read" on public.products
  for select using (is_active = true);

create policy "products_admin_all" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 0004_assets_and_product_assets.sql
-- ============================================================
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

-- ============================================================
-- 0005_reviews.sql
-- ============================================================
-- reviews — see docs/DATABASE_DESIGN.md §8. Marketing/content data, not verified
-- purchase reviews, since Amazon (or WhatsApp, per the current model) is the
-- purchasing platform. Preserve accurate `source` attribution — never imply a
-- review was independently collected on the ZWIK site if it came from elsewhere.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  customer_display_name text not null,
  rating numeric(2, 1) not null check (rating >= 0 and rating <= 5),
  review_text text not null,
  image_asset_id uuid references public.assets (id),
  source text not null default 'direct',
  is_featured boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reviews_product_active_idx on public.reviews (product_id, is_active);
create index if not exists reviews_featured_active_idx on public.reviews (is_featured, is_active);

alter table public.reviews enable row level security;

create policy "reviews_public_read" on public.reviews
  for select using (is_active = true);

create policy "reviews_admin_all" on public.reviews
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 0006_hero_slides.sql
-- ============================================================
-- hero_slides — see docs/DATABASE_DESIGN.md §9.

create table if not exists public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets (id),
  heading text not null,
  subheading text,
  cta_label text,
  cta_type text check (cta_type in ('catalog', 'product', 'url')),
  cta_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hero_slides_cta_url_scheme check (
    cta_url is null or cta_url ~* '^(https?:)?/'
  )
);

create index if not exists hero_slides_active_sort_idx on public.hero_slides (is_active, sort_order);
create index if not exists hero_slides_schedule_idx on public.hero_slides (starts_at, ends_at);

alter table public.hero_slides enable row level security;

create policy "hero_slides_public_read" on public.hero_slides
  for select using (is_active = true);

create policy "hero_slides_admin_all" on public.hero_slides
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 0007_site_settings.sql
-- ============================================================
-- site_settings — see docs/DATABASE_DESIGN.md §10. Single-row controlled config table.

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  whatsapp_number text,
  whatsapp_default_message text,
  whatsapp_enabled boolean not null default true,
  amazon_store_url text,
  instagram_url text,
  contact_email text,
  brand_name text not null default 'ZWIK',
  default_seo_title text,
  default_seo_description text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

-- Enforce a single settings row via a constant expression unique index.
create unique index if not exists site_settings_singleton_idx
  on public.site_settings ((true));

alter table public.site_settings enable row level security;

create policy "site_settings_public_read" on public.site_settings
  for select using (true);

create policy "site_settings_admin_all" on public.site_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 0008_audit_logs.sql
-- ============================================================
-- audit_logs — see docs/DATABASE_DESIGN.md §11. Append-only; never store
-- passwords, tokens, or unnecessary personal data in before/after/metadata.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at);

alter table public.audit_logs enable row level security;

-- Audit logs are never publicly readable and never client-writable — only
-- admins can read them, and inserts happen exclusively through the service-role
-- client from trusted server code (server actions / admin mutations).
create policy "audit_logs_admin_read" on public.audit_logs
  for select using (public.is_admin());

-- ============================================================
-- 0009_seed_categories_products.sql
-- ============================================================
-- Seed data: real ZWIK catalog content (from the approved design reference),
-- NOT placeholder/fake data. Reviews are deliberately NOT seeded — the design
-- reference's testimonials are explicitly marked as placeholders, and
-- docs/DATABASE_DESIGN.md §8 forbids implying a review is genuine when it isn't.
-- Idempotent: safe to re-run.

insert into public.categories (name, slug, sort_order) values
  ('Desk', 'desk', 1),
  ('Monitor', 'monitor', 2),
  ('Dashboard', 'dashboard', 3),
  ('Shelf', 'shelf', 4)
on conflict (slug) do nothing;

insert into public.assets (filename, storage_path, media_type, mime_type, file_size_bytes, alt_text) values
  ('cat-set-white.jpg', 'products/cat-set-white.jpg', 'image', 'image/jpeg', 110341, 'Sunhat cat dashboard set on a white background'),
  ('cat-set-dashboard.jpg', 'products/cat-set-dashboard.jpg', 'image', 'image/jpeg', 154343, 'Sunhat cat dashboard set mounted on a car dashboard'),
  ('cat-set-monitor-2.jpg', 'products/cat-set-monitor-2.jpg', 'image', 'image/jpeg', 104458, 'Sunhat cat set perched on a monitor'),
  ('cat-set-flatlay.jpg', 'products/cat-set-flatlay.jpg', 'image', 'image/jpeg', 118328, 'Sunhat cat set laid out flat on a desk'),
  ('cat-set-monitor.jpg', 'products/cat-set-monitor.jpg', 'image', 'image/jpeg', 112062, 'Cat figurine on a monitor bezel'),
  ('cat-monitor-sleepy.jpg', 'products/cat-monitor-sleepy.jpg', 'image', 'image/jpeg', 82617, 'Sleepy tabby cat monitor topper'),
  ('houses-diorama.jpg', 'products/houses-diorama.jpg', 'image', 'image/jpeg', 202231, 'Miniature cottage houses on a grass diorama'),
  ('houses-pair.jpg', 'products/houses-pair.jpg', 'image', 'image/jpeg', 179126, 'A pair of miniature cottage houses'),
  ('houses-grass.jpg', 'products/houses-grass.jpg', 'image', 'image/jpeg', 78666, 'Miniature houses set in grass'),
  ('house-hand.jpg', 'products/house-hand.jpg', 'image', 'image/jpeg', 180619, 'A miniature house held in a hand for scale'),
  ('houses-dimensions.jpg', 'products/houses-dimensions.jpg', 'image', 'image/jpeg', 55508, 'Cottage house set shown with dimensions'),
  ('daisy-spring.jpg', 'products/daisy-spring.jpg', 'image', 'image/jpeg', 62912, 'Daisy on a spring dashboard ornament'),
  ('figurine-set.jpg', 'products/figurine-set.jpg', 'image', 'image/jpeg', 36365, 'Set of six cheeky boy figurines'),
  ('figurine-single.jpg', 'products/figurine-single.jpg', 'image', 'image/jpeg', 39670, 'Single cheeky boy figurine, close up')
on conflict (storage_path) do nothing;

insert into public.products (
  sku, name, slug, short_description, description, features,
  category_id, price, currency, is_featured, is_active, sort_order
) values
  (
    'ZW-01', 'Sunhat cat, dashboard set', 'sunhat-cat-dashboard-set',
    '6 cm cat · 2 cm chicks',
    'An orange tabby in a woven straw hat and tiny sunglasses, with two chicks to keep it company. Comes with adhesive pads, so it holds on a dashboard, a monitor edge, or a shelf lip.',
    '[
      {"label": "Pieces", "value": "5 — cat, hat, glasses, 2 chicks"},
      {"label": "Material", "value": "Hand-painted resin"},
      {"label": "Mounting", "value": "Adhesive pads included"},
      {"label": "Best for", "value": "Dashboard, monitor, desk"},
      {"label": "Care", "value": "Wipe with a dry cloth"}
    ]'::jsonb,
    (select id from public.categories where slug = 'dashboard'),
    899, 'INR', true, true, 1
  ),
  (
    'ZW-02', 'Sleepy tabby, monitor topper', 'sleepy-tabby-monitor-topper',
    '4.5 cm tall',
    'The same shy tabby, no hat, no entourage. Flat-footed so it balances on a monitor bezel and looks like it is thinking about something.',
    '[
      {"label": "Pieces", "value": "1"},
      {"label": "Material", "value": "Hand-painted resin"},
      {"label": "Mounting", "value": "Free-standing, flat base"},
      {"label": "Best for", "value": "Monitor, desk"},
      {"label": "Care", "value": "Wipe with a dry cloth"}
    ]'::jsonb,
    (select id from public.categories where slug = 'monitor'),
    499, 'INR', false, true, 2
  ),
  (
    'ZW-03', 'Cottage village, set of four', 'cottage-village-set-of-four',
    '2.7–3.2 cm each',
    'Four little houses — tile roofs, stone walls, yellow windows — each on its own base. Line them along a shelf or scatter them in a planter and you have a village.',
    '[
      {"label": "Pieces", "value": "4 houses"},
      {"label": "Material", "value": "Hand-painted resin"},
      {"label": "Dimensions", "value": "2.7–3.2 cm tall"},
      {"label": "Best for", "value": "Shelf, planter, desk"},
      {"label": "Care", "value": "Dust with a soft brush"}
    ]'::jsonb,
    (select id from public.categories where slug = 'shelf'),
    799, 'INR', true, true, 3
  ),
  (
    'ZW-04', 'Daisy on a spring', 'daisy-on-a-spring',
    '5 cm tall',
    'A purple daisy on a coiled steel spring with a weighted base. It nods for a few seconds every time you shut the car door or nudge the desk.',
    '[
      {"label": "Pieces", "value": "1"},
      {"label": "Material", "value": "Resin flower, steel spring"},
      {"label": "Height", "value": "5 cm"},
      {"label": "Best for", "value": "Dashboard, desk"},
      {"label": "Care", "value": "Keep out of direct sun"}
    ]'::jsonb,
    (select id from public.categories where slug = 'dashboard'),
    299, 'INR', false, true, 4
  ),
  (
    'ZW-05', 'Cheeky boy figures, set of six', 'cheeky-boy-figures-set-of-six',
    '3.4–3.8 cm each',
    'Six tiny figures in six poses — waving, sulking, hiding, holding a gift. Small enough to line up along a keyboard or hide one in a colleague''s pen cup.',
    '[
      {"label": "Pieces", "value": "6 figures"},
      {"label": "Material", "value": "Hand-painted resin"},
      {"label": "Dimensions", "value": "3.4 × 3.8 cm"},
      {"label": "Best for", "value": "Desk, shelf"},
      {"label": "Care", "value": "Wipe with a dry cloth"}
    ]'::jsonb,
    (select id from public.categories where slug = 'desk'),
    699, 'INR', false, true, 5
  )
on conflict (slug) do nothing;

insert into public.product_assets (product_id, asset_id, role, sort_order)
select p.id, a.id, x.role, x.sort_order
from (values
  ('sunhat-cat-dashboard-set', 'products/cat-set-white.jpg', 'main', 0),
  ('sunhat-cat-dashboard-set', 'products/cat-set-dashboard.jpg', 'gallery', 1),
  ('sunhat-cat-dashboard-set', 'products/cat-set-monitor-2.jpg', 'gallery', 2),
  ('sunhat-cat-dashboard-set', 'products/cat-set-flatlay.jpg', 'gallery', 3),
  ('sunhat-cat-dashboard-set', 'products/cat-set-monitor.jpg', 'gallery', 4),
  ('sleepy-tabby-monitor-topper', 'products/cat-monitor-sleepy.jpg', 'main', 0),
  ('sleepy-tabby-monitor-topper', 'products/cat-set-monitor.jpg', 'gallery', 1),
  ('cottage-village-set-of-four', 'products/houses-diorama.jpg', 'main', 0),
  ('cottage-village-set-of-four', 'products/houses-pair.jpg', 'gallery', 1),
  ('cottage-village-set-of-four', 'products/houses-grass.jpg', 'gallery', 2),
  ('cottage-village-set-of-four', 'products/house-hand.jpg', 'gallery', 3),
  ('cottage-village-set-of-four', 'products/houses-dimensions.jpg', 'gallery', 4),
  ('daisy-on-a-spring', 'products/daisy-spring.jpg', 'main', 0),
  ('cheeky-boy-figures-set-of-six', 'products/figurine-set.jpg', 'main', 0),
  ('cheeky-boy-figures-set-of-six', 'products/figurine-single.jpg', 'gallery', 1)
) as x (product_slug, storage_path, role, sort_order)
join public.products p on p.slug = x.product_slug
join public.assets a on a.storage_path = x.storage_path
on conflict (product_id, asset_id) do nothing;

insert into public.site_settings (whatsapp_number, whatsapp_default_message, brand_name)
select '917666068317', 'Hi ZWIK! I saw your site and wanted to ask about a piece.', 'ZWIK'
where not exists (select 1 from public.site_settings);

-- ============================================================
-- 0010_storage_bucket.sql
-- ============================================================
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

