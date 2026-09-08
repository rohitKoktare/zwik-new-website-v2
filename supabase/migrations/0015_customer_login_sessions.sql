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
