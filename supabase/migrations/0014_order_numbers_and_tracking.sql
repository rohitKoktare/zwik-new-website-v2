-- Order numbers and customer-facing tracking tokens.
--
-- Until now an order had only its primary-key UUID, which the customer never
-- saw — the cart discarded the id the capture returned. Two things are added:
--
--  * `order_number` — a short human handle (ZW-YYMM-NNNN) to read out over
--    WhatsApp and to search on in the admin.
--  * `public_token` — the capability token the tracking URL is built from.
--
-- These are deliberately two different columns, and neither is the primary key.
-- ARCHITECTURE.md §18 says never put internal ids in a message; a separate
-- token also means a leaked link can be rotated without touching the row's
-- identity or any foreign key pointing at it.
--
-- `order_number` is NOT a secret. It appears in the WhatsApp message and is
-- guessable by design (it is sequential within a month), which is exactly why
-- the Stage 2 lookup form will require order number AND phone together.
-- `public_token` is the secret: 128 random bits, unguessable, and on its own
-- sufficient to view one order.

-- ---------------------------------------------------------------------------
-- Monthly counter
--
-- A plain sequence cannot restart per month, so the period is carried in its
-- own row. One row per YYMM, holding the last number issued.
-- ---------------------------------------------------------------------------

create table if not exists public.order_number_counters (
  period text primary key,
  last_value integer not null default 0
);

comment on table public.order_number_counters is
  'One row per YYMM (IST). Written only by next_order_number(); never read by the app.';

-- RLS on with no policies at all: nothing outside a security-definer function
-- or the service-role client may touch this. Same posture as audit_logs, which
-- has no insert policy either.
alter table public.order_number_counters enable row level security;

/*
 * Issues the next order number for the current month.
 *
 * The insert-on-conflict-returning is one statement, so two concurrent orders
 * cannot be handed the same number: the second blocks on the first's row lock
 * and then increments the committed value. Doing this as SELECT-then-UPDATE
 * would race under exactly the load that matters.
 *
 * The month boundary is IST, not UTC — ZWIK ships only within India
 * (ARCHITECTURE.md §18), so an order placed at 03:00 IST on the 1st belongs to
 * the new month the way the business counts it.
 */
create or replace function public.next_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_period text := to_char(now() at time zone 'Asia/Kolkata', 'YYMM');
  issued integer;
begin
  insert into public.order_number_counters (period, last_value)
  values (current_period, 1)
  on conflict (period)
    do update set last_value = public.order_number_counters.last_value + 1
  returning last_value into issued;

  return 'ZW-' || current_period || '-' || lpad(issued::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Columns on orders
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists order_number text;

alter table public.orders
  add column if not exists public_token uuid not null default gen_random_uuid();

/*
 * Fills order_number on insert when the caller did not supply one.
 *
 * A trigger rather than a column DEFAULT: an explicit `null` in an INSERT
 * overrides a DEFAULT but not a trigger, and the capture action builds its row
 * object from a variable set, so a stray null is a realistic mistake to absorb
 * rather than a hypothetical one.
 */
create or replace function public.set_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null then
    new.order_number := public.next_order_number();
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_order_number on public.orders;
create trigger orders_set_order_number
  before insert on public.orders
  for each row
  execute function public.set_order_number();

-- Backfill anything that predates the trigger. `orders` is empty today, so this
-- is a formality — but a migration that only works on an empty table is a trap
-- for the next environment.
update public.orders
set order_number = public.next_order_number()
where order_number is null;

alter table public.orders
  alter column order_number set not null;

-- Unique after backfill, so the constraint cannot fail mid-migration.
create unique index if not exists orders_order_number_idx
  on public.orders (order_number);

create unique index if not exists orders_public_token_idx
  on public.orders (public_token);

comment on column public.orders.order_number is
  'Human handle, ZW-YYMM-NNNN. Shown to the customer and searchable in admin. Not a secret.';

comment on column public.orders.public_token is
  'Capability token for the customer tracking URL. Secret: on its own it grants read access to this order.';

-- ---------------------------------------------------------------------------
-- The status comment from 0012 is now wrong.
--
-- It read "initiated = handed to WhatsApp, unconfirmed", which described a flow
-- where the site could not tell whether the customer ever sent the message.
-- Placing an order is now an on-site action that always records a row, so
-- `initiated` means placed-but-not-yet-agreed. See ARCHITECTURE.md §5.1.
-- ---------------------------------------------------------------------------

comment on column public.orders.status is
  'initiated = placed on the site, not yet agreed with the customer. Only a human sets confirmed.';
