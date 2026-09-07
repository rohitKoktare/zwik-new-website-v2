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
