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
