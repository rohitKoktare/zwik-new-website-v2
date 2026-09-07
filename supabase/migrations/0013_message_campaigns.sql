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
