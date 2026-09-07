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
