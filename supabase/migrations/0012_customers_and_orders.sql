-- customers, orders, order_items — see docs/DATABASE_DESIGN.md §22–§24.
--
-- This migration reverses a deliberate property of the original architecture.
-- ARCHITECTURE.md §5 previously guaranteed "the cart never reaches the server,
-- so no customer PII is stored by the site". Persisting customers and orders is
-- the explicit scope change §5 said would be required, requested so ZWIK can
-- keep order records and run WhatsApp campaigns.
--
-- Consequences that shape the schema:
--
--  1. PERSONAL DATA NOW LIVES HERE. None of these tables has a public read
--     policy, and none is client-writable. Customer-facing inserts happen only
--     through the service-role client from a validated server action, exactly
--     like audit_logs (migration 0008). A public SELECT policy on `customers`
--     would expose every buyer's phone number to anyone with the anon key.
--
--  2. ERASURE MUST BE POSSIBLE. India's DPDP Act 2023 gives a person the right
--     to have their personal data erased. Contact details therefore live ONLY on
--     `customers` — orders deliberately do not copy the name or phone. Deleting
--     a customer row removes the personal data while `orders.customer_id` goes
--     null, so the sales record survives in anonymous form. If orders duplicated
--     the phone number, erasure would be impossible without destroying business
--     records.
--
--  3. AN ORDER IS NOT CONFIRMED. The site hands off to WhatsApp via a wa.me
--     deep link; it cannot observe whether the customer actually pressed send.
--     `status` therefore defaults to 'initiated' and only a human moves it to
--     'confirmed'. Nothing may treat an initiated row as a placed order.
--
--  4. MARKETING CONSENT IS SEPARATE FROM ORDERING. Placing an order is consent
--     to be contacted about that order, and nothing more. Campaign sending must
--     check `marketing_consent` and `unsubscribed_at` — see §24.

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),

  -- Digits only, including country code — the same normalisation used to build
  -- a wa.me link (DATABASE_DESIGN.md §14). This is the customer's identity, so
  -- it is unique: a repeat buyer updates their row rather than creating another.
  phone text not null unique check (phone ~ '^[0-9]{10,15}$'),

  name text,
  city_and_pincode text,

  -- Explicit opt-in for marketing. Default false: an unchecked box, a missing
  -- field, or a forged request must never produce consent.
  marketing_consent boolean not null default false,
  -- Evidence of when and where consent was given, so it can be defended.
  marketing_consent_at timestamptz,
  marketing_consent_source text,

  -- Set when the customer opts out. Overrides marketing_consent so a later
  -- re-tick of the cart checkbox cannot silently resurrect a withdrawn consent.
  unsubscribed_at timestamptz,

  -- Free-text for ZWIK's own reference. Never put card or payment data here.
  admin_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customers is
  'Personal data. No public read policy, ever. Deleting a row is the DPDP erasure path.';
comment on column public.customers.marketing_consent is
  'Explicit opt-in only. Campaign sends must also check unsubscribed_at is null.';

create index if not exists customers_created_at_idx on public.customers (created_at desc);
-- Supports the campaign audience query: consented and not unsubscribed.
create index if not exists customers_marketing_idx
  on public.customers (marketing_consent, unsubscribed_at);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),

  -- Nullable so erasing a customer leaves an anonymous sales record (see §2).
  customer_id uuid references public.customers (id) on delete set null,

  -- 'initiated' = composed on the site and handed to WhatsApp. NOT a placed
  -- order: the site cannot know the message was sent (see §3).
  status text not null default 'initiated'
    check (status in ('initiated', 'confirmed', 'cancelled', 'fulfilled')),

  -- Money is snapshotted at hand-off. Product prices change; what was quoted
  -- to this customer must not change with them.
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  -- Null when the site did not quote a delivery charge — the cart says
  -- "Confirmed on WhatsApp" in that case and this must not become a 0.
  delivery_charge numeric(12, 2) check (delivery_charge is null or delivery_charge >= 0),
  -- Exactly what the customer was shown: 'Free', '₹79', 'Confirmed on WhatsApp'.
  delivery_label text,
  total numeric(12, 2) not null check (total >= 0),
  currency text not null default 'INR',

  gift_wrap boolean not null default false,
  -- The customer's own words. May contain personal details they chose to type.
  customer_note text,

  source text not null default 'website_cart',

  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on column public.orders.status is
  'initiated = handed to WhatsApp, unconfirmed. Only a human sets confirmed.';

create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_status_created_idx on public.orders (status, created_at desc);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,

  -- Nullable: a product may be deleted later, and the line must survive.
  product_id uuid references public.products (id) on delete set null,

  -- Snapshots, so the line still reads correctly after the product is renamed,
  -- repriced or removed. Not personal data.
  sku text,
  name text not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  qty integer not null check (qty > 0),
  line_total numeric(12, 2) not null check (line_total >= 0),

  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- RLS
--
-- Same shape as audit_logs (0008): admin-only read, admin-only write, and NO
-- policy for anon or authenticated non-admins. Customer-facing order capture
-- runs through the service-role client in a server action, which bypasses RLS
-- and is the single validated write path.
--
-- Deliberately absent: any "public insert" policy. One would let anyone with
-- the anon key forge orders and enumerate the tables.
-- ---------------------------------------------------------------------------

alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "customers_admin_read" on public.customers
  for select using (public.is_admin());
create policy "customers_admin_write" on public.customers
  for all using (public.is_admin()) with check (public.is_admin());

create policy "orders_admin_read" on public.orders
  for select using (public.is_admin());
create policy "orders_admin_write" on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

create policy "order_items_admin_read" on public.order_items
  for select using (public.is_admin());
create policy "order_items_admin_write" on public.order_items
  for all using (public.is_admin()) with check (public.is_admin());
