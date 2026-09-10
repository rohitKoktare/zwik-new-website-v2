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

-- ============================================================
-- 0011_delivery_settings.sql
-- ============================================================
-- Delivery terms on site_settings — see docs/DATABASE_DESIGN.md §10.
--
-- ZWIK quotes delivery on WhatsApp, but the free-delivery threshold is the one
-- number customers act on before they message, so it belongs on the site and
-- must be editable without a deploy.
--
-- Nullable on purpose: null means "no free-delivery offer is running", and the
-- storefront then says nothing rather than advertising a ₹0 threshold.

alter table public.site_settings
  add column if not exists free_delivery_threshold numeric(12, 2)
    check (free_delivery_threshold is null or free_delivery_threshold >= 0);

alter table public.site_settings
  add column if not exists delivery_scope_note text;

-- The flat fee charged below the threshold. This one is quoted to the customer
-- inside the WhatsApp order message, so it is operational data, not marketing
-- copy — it was previously hard-coded at 79 in the cart drawer, which meant the
-- site quoted a delivery charge nobody could change without a deploy.
--
-- Null means "we do not quote a delivery charge on the site"; the cart then
-- says delivery is confirmed on WhatsApp instead of inventing a number.
alter table public.site_settings
  add column if not exists delivery_fee numeric(12, 2)
    check (delivery_fee is null or delivery_fee >= 0);

comment on column public.site_settings.free_delivery_threshold is
  'Cart subtotal at or above which delivery is free. Null = no offer running.';

comment on column public.site_settings.delivery_scope_note is
  'Where the offer applies, e.g. "across all India". Shown next to the threshold.';

comment on column public.site_settings.delivery_fee is
  'Flat delivery charge below the threshold. Null = quoted on WhatsApp instead.';

-- ============================================================
-- 0012_customers_and_orders.sql
-- ============================================================
-- customers, orders, order_items — see docs/DATABASE_DESIGN.md §22–§24.
--
-- This migration reverses a deliberate property of the original architecture.
-- ARCHITECTURE.md §5 previously guaranteed "the cart never reaches the server,
-- so no customer PII is stored by the site". Persisting customers and orders is
-- the explicit scope change §5 said would be required, requested so ZWIK can
-- keep order records and run WhatsApp campaigns.
--
-- Consequences that shape the schema:
--
--  1. PERSONAL DATA NOW LIVES HERE. None of these tables has a public read
--     policy, and none is client-writable. Customer-facing inserts happen only
--     through the service-role client from a validated server action, exactly
--     like audit_logs (migration 0008). A public SELECT policy on `customers`
--     would expose every buyer's phone number to anyone with the anon key.
--
--  2. ERASURE MUST BE POSSIBLE. India's DPDP Act 2023 gives a person the right
--     to have their personal data erased. Contact details therefore live ONLY on
--     `customers` — orders deliberately do not copy the name or phone. Deleting
--     a customer row removes the personal data while `orders.customer_id` goes
--     null, so the sales record survives in anonymous form. If orders duplicated
--     the phone number, erasure would be impossible without destroying business
--     records.
--
--  3. AN ORDER IS NOT CONFIRMED. The site hands off to WhatsApp via a wa.me
--     deep link; it cannot observe whether the customer actually pressed send.
--     `status` therefore defaults to 'initiated' and only a human moves it to
--     'confirmed'. Nothing may treat an initiated row as a placed order.
--
--  4. MARKETING CONSENT IS SEPARATE FROM ORDERING. Placing an order is consent
--     to be contacted about that order, and nothing more. Campaign sending must
--     check `marketing_consent` and `unsubscribed_at` — see §24.

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),

  -- Digits only, including country code — the same normalisation used to build
  -- a wa.me link (DATABASE_DESIGN.md §14). This is the customer's identity, so
  -- it is unique: a repeat buyer updates their row rather than creating another.
  phone text not null unique check (phone ~ '^[0-9]{10,15}$'),

  name text,
  city_and_pincode text,

  -- Explicit opt-in for marketing. Default false: an unchecked box, a missing
  -- field, or a forged request must never produce consent.
  marketing_consent boolean not null default false,
  -- Evidence of when and where consent was given, so it can be defended.
  marketing_consent_at timestamptz,
  marketing_consent_source text,

  -- Set when the customer opts out. Overrides marketing_consent so a later
  -- re-tick of the cart checkbox cannot silently resurrect a withdrawn consent.
  unsubscribed_at timestamptz,

  -- Free-text for ZWIK's own reference. Never put card or payment data here.
  admin_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customers is
  'Personal data. No public read policy, ever. Deleting a row is the DPDP erasure path.';
comment on column public.customers.marketing_consent is
  'Explicit opt-in only. Campaign sends must also check unsubscribed_at is null.';

create index if not exists customers_created_at_idx on public.customers (created_at desc);
-- Supports the campaign audience query: consented and not unsubscribed.
create index if not exists customers_marketing_idx
  on public.customers (marketing_consent, unsubscribed_at);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),

  -- Nullable so erasing a customer leaves an anonymous sales record (see §2).
  customer_id uuid references public.customers (id) on delete set null,

  -- 'initiated' = composed on the site and handed to WhatsApp. NOT a placed
  -- order: the site cannot know the message was sent (see §3).
  status text not null default 'initiated'
    check (status in ('initiated', 'confirmed', 'cancelled', 'fulfilled')),

  -- Money is snapshotted at hand-off. Product prices change; what was quoted
  -- to this customer must not change with them.
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  -- Null when the site did not quote a delivery charge — the cart says
  -- "Confirmed on WhatsApp" in that case and this must not become a 0.
  delivery_charge numeric(12, 2) check (delivery_charge is null or delivery_charge >= 0),
  -- Exactly what the customer was shown: 'Free', '₹79', 'Confirmed on WhatsApp'.
  delivery_label text,
  total numeric(12, 2) not null check (total >= 0),
  currency text not null default 'INR',

  gift_wrap boolean not null default false,
  -- The customer's own words. May contain personal details they chose to type.
  customer_note text,

  source text not null default 'website_cart',

  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on column public.orders.status is
  'initiated = handed to WhatsApp, unconfirmed. Only a human sets confirmed.';

create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_status_created_idx on public.orders (status, created_at desc);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,

  -- Nullable: a product may be deleted later, and the line must survive.
  product_id uuid references public.products (id) on delete set null,

  -- Snapshots, so the line still reads correctly after the product is renamed,
  -- repriced or removed. Not personal data.
  sku text,
  name text not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  qty integer not null check (qty > 0),
  line_total numeric(12, 2) not null check (line_total >= 0),

  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- RLS
--
-- Same shape as audit_logs (0008): admin-only read, admin-only write, and NO
-- policy for anon or authenticated non-admins. Customer-facing order capture
-- runs through the service-role client in a server action, which bypasses RLS
-- and is the single validated write path.
--
-- Deliberately absent: any "public insert" policy. One would let anyone with
-- the anon key forge orders and enumerate the tables.
-- ---------------------------------------------------------------------------

alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "customers_admin_read" on public.customers
  for select using (public.is_admin());
create policy "customers_admin_write" on public.customers
  for all using (public.is_admin()) with check (public.is_admin());

create policy "orders_admin_read" on public.orders
  for select using (public.is_admin());
create policy "orders_admin_write" on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

create policy "order_items_admin_read" on public.order_items
  for select using (public.is_admin());
create policy "order_items_admin_write" on public.order_items
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 0013_message_campaigns.sql
-- ============================================================
-- message_campaigns, campaign_recipients — see docs/DATABASE_DESIGN.md §25–§26.
--
-- Supports admin-sent WhatsApp campaigns. Sending is MANUAL: ZWIK has no
-- WhatsApp Business Platform (Cloud API) credentials, and a wa.me link cannot
-- deliver a message — it only opens WhatsApp with text prefilled, and a human
-- presses send (ARCHITECTURE.md §18).
--
-- So these tables are a worklist, not a send queue. `campaign_recipients.status`
-- records what a human did, and nothing in the system can mark a message sent
-- on its own — the site genuinely cannot observe delivery.
--
-- If the Cloud API is adopted later, this schema still holds; it gains template
-- name/parameter columns and the status transitions start coming from webhooks
-- instead of button clicks.

create table if not exists public.message_campaigns (
  id uuid primary key default gen_random_uuid(),

  -- Internal label, never sent to anyone.
  name text not null check (length(btrim(name)) > 0),

  -- The message body, before the opt-out line is appended at send time.
  -- May contain the {name} token.
  body text not null check (length(btrim(body)) > 0),

  -- draft     — being written; no recipients snapshotted yet
  -- sending   — audience locked in, working through the list
  -- completed — no pending recipients left
  -- cancelled — abandoned; remaining recipients stay pending and unsent
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'completed', 'cancelled')),

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- When the audience was snapshotted.
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists message_campaigns_status_idx
  on public.message_campaigns (status, created_at desc);

-- ---------------------------------------------------------------------------
-- campaign_recipients
--
-- The audience is snapshotted when a campaign starts, so progress is stable
-- while the admin works through it and a customer added tomorrow does not
-- silently join a send already in flight.
--
-- Snapshotting does NOT mean consent is snapshotted. A customer who
-- unsubscribes after the snapshot must not receive the message, so consent is
-- re-checked live before any link is built. The row is then marked 'skipped'.
-- ---------------------------------------------------------------------------

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.message_campaigns (id) on delete cascade,

  -- Set null on erasure, like orders: the campaign's history survives without
  -- the personal data (migration 0012 §2). A null customer can never be sent to.
  customer_id uuid references public.customers (id) on delete set null,

  -- pending — not yet actioned
  -- sent    — a human opened WhatsApp and confirmed they sent it
  -- skipped — deliberately passed over, or no longer contactable
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'skipped')),

  -- Why a recipient was skipped, e.g. 'unsubscribed', 'erased', 'manual'.
  skip_reason text,

  sent_at timestamptz,
  -- Which admin pressed the button. Accountability for outbound marketing.
  sent_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),

  -- One row per customer per campaign; makes re-snapshotting idempotent and
  -- stops the same person being messaged twice from one campaign.
  unique (campaign_id, customer_id)
);

create index if not exists campaign_recipients_campaign_status_idx
  on public.campaign_recipients (campaign_id, status);
create index if not exists campaign_recipients_customer_idx
  on public.campaign_recipients (customer_id);

-- ---------------------------------------------------------------------------
-- RLS — admin only, both directions. Campaign rows join to personal data, and
-- nothing here is ever public or client-writable.
-- ---------------------------------------------------------------------------

alter table public.message_campaigns enable row level security;
alter table public.campaign_recipients enable row level security;

create policy "message_campaigns_admin_read" on public.message_campaigns
  for select using (public.is_admin());
create policy "message_campaigns_admin_write" on public.message_campaigns
  for all using (public.is_admin()) with check (public.is_admin());

create policy "campaign_recipients_admin_read" on public.campaign_recipients
  for select using (public.is_admin());
create policy "campaign_recipients_admin_write" on public.campaign_recipients
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 0014_order_numbers_and_tracking.sql
-- ============================================================
-- Order numbers and customer-facing tracking tokens.
--
-- Until now an order had only its primary-key UUID, which the customer never
-- saw — the cart discarded the id the capture returned. Two things are added:
--
--  * `order_number` — a short human handle (ZW-YYMM-NNNN) to read out over
--    WhatsApp and to search on in the admin.
--  * `public_token` — the capability token the tracking URL is built from.
--
-- These are deliberately two different columns, and neither is the primary key.
-- ARCHITECTURE.md §18 says never put internal ids in a message; a separate
-- token also means a leaked link can be rotated without touching the row's
-- identity or any foreign key pointing at it.
--
-- `order_number` is NOT a secret. It appears in the WhatsApp message and is
-- guessable by design (it is sequential within a month), which is exactly why
-- the Stage 2 lookup form will require order number AND phone together.
-- `public_token` is the secret: 128 random bits, unguessable, and on its own
-- sufficient to view one order.

-- ---------------------------------------------------------------------------
-- Monthly counter
--
-- A plain sequence cannot restart per month, so the period is carried in its
-- own row. One row per YYMM, holding the last number issued.
-- ---------------------------------------------------------------------------

create table if not exists public.order_number_counters (
  period text primary key,
  last_value integer not null default 0
);

comment on table public.order_number_counters is
  'One row per YYMM (IST). Written only by next_order_number(); never read by the app.';

-- RLS on with no policies at all: nothing outside a security-definer function
-- or the service-role client may touch this. Same posture as audit_logs, which
-- has no insert policy either.
alter table public.order_number_counters enable row level security;

/*
 * Issues the next order number for the current month.
 *
 * The insert-on-conflict-returning is one statement, so two concurrent orders
 * cannot be handed the same number: the second blocks on the first's row lock
 * and then increments the committed value. Doing this as SELECT-then-UPDATE
 * would race under exactly the load that matters.
 *
 * The month boundary is IST, not UTC — ZWIK ships only within India
 * (ARCHITECTURE.md §18), so an order placed at 03:00 IST on the 1st belongs to
 * the new month the way the business counts it.
 */
create or replace function public.next_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_period text := to_char(now() at time zone 'Asia/Kolkata', 'YYMM');
  issued integer;
begin
  insert into public.order_number_counters (period, last_value)
  values (current_period, 1)
  on conflict (period)
    do update set last_value = public.order_number_counters.last_value + 1
  returning last_value into issued;

  return 'ZW-' || current_period || '-' || lpad(issued::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Columns on orders
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists order_number text;

alter table public.orders
  add column if not exists public_token uuid not null default gen_random_uuid();

/*
 * Fills order_number on insert when the caller did not supply one.
 *
 * A trigger rather than a column DEFAULT: an explicit `null` in an INSERT
 * overrides a DEFAULT but not a trigger, and the capture action builds its row
 * object from a variable set, so a stray null is a realistic mistake to absorb
 * rather than a hypothetical one.
 */
create or replace function public.set_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null then
    new.order_number := public.next_order_number();
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_order_number on public.orders;
create trigger orders_set_order_number
  before insert on public.orders
  for each row
  execute function public.set_order_number();

-- Backfill anything that predates the trigger. `orders` is empty today, so this
-- is a formality — but a migration that only works on an empty table is a trap
-- for the next environment.
update public.orders
set order_number = public.next_order_number()
where order_number is null;

alter table public.orders
  alter column order_number set not null;

-- Unique after backfill, so the constraint cannot fail mid-migration.
create unique index if not exists orders_order_number_idx
  on public.orders (order_number);

create unique index if not exists orders_public_token_idx
  on public.orders (public_token);

comment on column public.orders.order_number is
  'Human handle, ZW-YYMM-NNNN. Shown to the customer and searchable in admin. Not a secret.';

comment on column public.orders.public_token is
  'Capability token for the customer tracking URL. Secret: on its own it grants read access to this order.';

-- ---------------------------------------------------------------------------
-- The status comment from 0012 is now wrong.
--
-- It read "initiated = handed to WhatsApp, unconfirmed", which described a flow
-- where the site could not tell whether the customer ever sent the message.
-- Placing an order is now an on-site action that always records a row, so
-- `initiated` means placed-but-not-yet-agreed. See ARCHITECTURE.md §5.1.
-- ---------------------------------------------------------------------------

comment on column public.orders.status is
  'initiated = placed on the site, not yet agreed with the customer. Only a human sets confirmed.';

-- ============================================================
-- 0015_customer_login_sessions.sql
-- ============================================================
-- Phone-number sign-in for customers, so they can see their own order
-- history in one place instead of only through a single tracking link.
--
-- Deliberately NOT built on Supabase Auth (no auth.users row is created for a
-- customer). Real phone verification (SMS OTP) is deferred — it has an
-- ongoing per-message cost and, for India, a DLT sender-ID registration step
-- outside this codebase — so for now, entering a phone number that has orders
-- on file signs you in directly. See docs/ARCHITECTURE.md §16.1 and
-- docs/DATABASE_DESIGN.md for the fuller reasoning and the exit plan once a
-- vendor is configured.
--
-- Sessions are a bespoke opaque token, not a JWT: the same trust-boundary
-- pattern as orders.public_token (migration 0014) — the token is the
-- authorization, a service-role read is the trust boundary, and RLS on
-- customers/orders/order_items does not change at all.

create table public.customer_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  -- Only ever the hash is stored, never the raw token — the same reason a
  -- password would never be stored in the clear. A leak of this table alone
  -- does not hand out a working session.
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create index customer_sessions_customer_idx on public.customer_sessions (customer_id);
create index customer_sessions_expires_idx on public.customer_sessions (expires_at);

comment on table public.customer_sessions is
  'Phone sign-in sessions. Deleting the customers row cascades these away, which is what makes DPDP erasure also revoke any live session for free.';

-- RLS on with no policies at all, same posture as order_number_counters
-- (migration 0014): nothing outside the service-role client may touch this.
alter table public.customer_sessions enable row level security;

create table public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index otp_codes_customer_idx on public.otp_codes (customer_id);

comment on table public.otp_codes is
  'Unused until OTP_PROVIDER is set (lib/customer-auth/otp-provider.ts). Created now so turning real verification on later is an env var and a vendor account, not a second migration.';

alter table public.otp_codes enable row level security;

create table public.login_attempts (
  ip_hash text primary key,
  window_start timestamptz not null default now(),
  attempt_count integer not null default 1
);

comment on table public.login_attempts is
  'Sliding-window throttle for phone sign-in, keyed by a hash of the caller IP. Written only by record_login_attempt().';

alter table public.login_attempts enable row level security;

/*
 * Atomic increment-or-reset for the sign-in rate limit.
 *
 * Same insert-on-conflict-returning shape as next_order_number() (migration
 * 0014): one statement, so two concurrent requests from the same source
 * cannot both read a stale count and both be let through. The window resets
 * lazily (on the next attempt after it has elapsed) rather than via a cron
 * job — nothing needs to run for an inactive IP's row to become irrelevant.
 */
create or replace function public.record_login_attempt(p_ip_hash text, p_window interval)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  result integer;
begin
  insert into public.login_attempts (ip_hash, window_start, attempt_count)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update set
    attempt_count = case
      when public.login_attempts.window_start < now() - p_window then 1
      else public.login_attempts.attempt_count + 1
    end,
    window_start = case
      when public.login_attempts.window_start < now() - p_window then now()
      else public.login_attempts.window_start
    end
  returning attempt_count into result;

  return result;
end;
$$;

-- ============================================================
-- 0016_lock_down_login_attempt_rpc.sql
-- ============================================================
-- record_login_attempt() (migration 0015) is a security definer function, but
-- Postgres grants EXECUTE on a new function to PUBLIC by default -- verified
-- against the live database: the anon key could call it directly, passing any
-- ip_hash it liked, not just its own.
--
-- The blast radius is narrow (it only touches the login_attempts bookkeeping
-- table, not customers/orders), but it does open one real griefing vector:
-- since IP addresses aren't secret, anyone can compute sha256(target_ip)
-- themselves and call this function directly to pre-fill a specific person's
-- rate-limit bucket, throttling their real sign-in attempts. Locking this down
-- closes that off entirely -- only the service-role client (which is how
-- lib/customer-auth/rate-limit.ts calls it) may execute it.

revoke execute on function public.record_login_attempt(text, interval) from public;
revoke execute on function public.record_login_attempt(text, interval) from anon;
revoke execute on function public.record_login_attempt(text, interval) from authenticated;

-- ============================================================
-- 0017_security_hardening_pass.sql
-- ============================================================
-- Fixes from a security audit of the whole schema, done once the site was
-- close to production. Two independent, low-risk changes:

-- ---------------------------------------------------------------------------
-- 1. next_order_number() had the same gap 0016 already fixed for
--    record_login_attempt(): Postgres grants EXECUTE on a new function to
--    PUBLIC by default, so despite being `security definer`, the anon key
--    could call it directly via supabase.rpc('next_order_number') — verified
--    against the live database — advancing the real monthly counter and
--    burning order-number slots that a legitimate order will then skip over.
--    Safe to revoke: the only caller in the app is the BEFORE INSERT trigger
--    set_order_number() (migration 0014), which runs as the table owner
--    regardless of the calling role's own grants, and this function is never
--    referenced inside another table's RLS policy (unlike is_admin(), which
--    is why that one is deliberately left alone — see docs/DATABASE_DESIGN.md).
-- ---------------------------------------------------------------------------

revoke execute on function public.next_order_number() from public;
revoke execute on function public.next_order_number() from anon;
revoke execute on function public.next_order_number() from authenticated;

-- ---------------------------------------------------------------------------
-- 2. product_assets_public_read let an archived asset's join row (asset_id,
--    role, sort_order) stay visible through an active product, because it
--    only checked the product's is_active flag and never the linked asset's
--    own status — unlike assets_public_read, which does check status on the
--    assets table itself. Narrowing an existing read policy can only remove
--    rows a caller could see, never add any, so this is safe to apply without
--    the RLS-short-circuit risk noted in item 1's comment.
-- ---------------------------------------------------------------------------

alter policy "product_assets_public_read" on public.product_assets
  using (
    exists (
      select 1
      from public.products p
      join public.assets a on a.id = product_assets.asset_id
      where p.id = product_assets.product_id
        and p.is_active = true
        and a.status = 'active'
    )
  );

-- ============================================================
-- 0018_product_categories.sql
-- ============================================================
-- Lets a product belong to more than one category — e.g. a "dashboard cat"
-- miniature assignable to both Monitor and Table/Desk decor, so it shows up
-- browsing either one. Replaces the single `products.category_id` column with
-- a join table, mirroring the exact pattern `product_assets` (migration 0004)
-- already established for the products<->assets relationship.

create table if not exists public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (product_id, category_id)
);

create index if not exists product_categories_product_idx
  on public.product_categories (product_id);
create index if not exists product_categories_category_idx
  on public.product_categories (category_id);

comment on table public.product_categories is
  'Many-to-many: one product may sit in several categories at once. See docs/DATABASE_DESIGN.md §7a.';

alter table public.product_categories enable row level security;

/*
 * Both sides must be active, not just the product — mirrors the same
 * tightening 0017 made to product_assets_public_read for the identical
 * reason: an archived category is presumably archived because it should stop
 * being publicly promoted, so a product's badge/breadcrumb linking to it
 * should stop showing that link too, even while the product itself stays
 * live under its other (still-active) categories.
 *
 * This does NOT gate whether the product itself appears in the general
 * catalog — that stays governed by products.is_active alone (see
 * lib/supabase/queries/products.ts's getActiveProducts, which no longer
 * inner-joins through categories at all for the unfiltered case, precisely
 * so archiving a category can never silently remove a product from the
 * storefront).
 */
create policy "product_categories_public_read" on public.product_categories
  for select using (
    exists (
      select 1 from public.products p
      where p.id = product_categories.product_id and p.is_active = true
    )
    and exists (
      select 1 from public.categories c
      where c.id = product_categories.category_id and c.is_active = true
    )
  );

create policy "product_categories_admin_all" on public.product_categories
  for all using (public.is_admin()) with check (public.is_admin());

-- Backfill from the column being dropped below. Reads the table's current
-- state rather than re-deriving from migration 0009's seed inserts, which is
-- the correct way to backfill regardless of what has changed since 0009 ran.
insert into public.product_categories (product_id, category_id)
select id, category_id from public.products where category_id is not null
on conflict (product_id, category_id) do nothing;

drop index if exists public.products_category_active_idx;
alter table public.products drop column if exists category_id;
