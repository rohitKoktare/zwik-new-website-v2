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
