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
