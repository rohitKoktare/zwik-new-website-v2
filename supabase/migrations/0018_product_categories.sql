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
