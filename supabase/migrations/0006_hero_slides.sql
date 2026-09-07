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
