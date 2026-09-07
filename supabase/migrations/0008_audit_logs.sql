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
