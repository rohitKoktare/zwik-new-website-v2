# ZWIK Website — Database Design

## 1. Database Principles

Database: Supabase PostgreSQL.

Goals:
- Normalize core business entities.
- Avoid duplicated product/content data.
- Enforce integrity in the database.
- Use RLS for access control.
- Add indexes based on actual query patterns.
- Keep media binaries out of PostgreSQL.
- Maintain auditability of important admin changes.

Do not create tables merely because a UI component exists. Create entities around business/domain concepts.

## 2. Core Entities

Recommended initial entities:

1. profiles
2. products
3. categories
4. assets
5. product_assets
6. reviews
7. hero_slides
8. homepage_sections (only if flexible section management is genuinely needed)
9. site_settings
10. audit_logs

## 3. profiles

Purpose:
Application-level user/admin information linked to Supabase Auth.

Fields:
- id UUID — primary key, references auth.users(id)
- display_name
- role
- is_active
- created_at
- updated_at

Constraints:
- role controlled by an enum/check constraint
- unique user ID

Do not duplicate passwords or authentication secrets here.

## 4. categories

Fields:
- id UUID
- name
- slug
- description
- is_active
- sort_order
- created_at
- updated_at

Constraints:
- unique slug

Indexes:
- unique index on slug
- index on active/sort order if listing frequently

## 5. products

Recommended fields:

- id UUID primary key
- sku TEXT
- asin TEXT *(retained, nullable, unused — see "Important" below)*
- name TEXT
- slug TEXT
- short_description TEXT
- description TEXT
- features JSONB or TEXT[] depending on implementation
- category_id UUID nullable/required based on business rule
- price NUMERIC(12,2)
- original_price NUMERIC(12,2)
- currency TEXT
- amazon_url TEXT *(retained, nullable, unused — see "Important" below)*
- rating NUMERIC(2,1)
- review_count INTEGER
- is_featured BOOLEAN
- is_active BOOLEAN
- sort_order INTEGER
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

Constraints:
- unique slug
- SKU unique if SKU is authoritative
- ASIN unique when present
- price >= 0
- original_price >= 0 when present
- rating between 0 and 5
- review_count >= 0

Important:
WhatsApp is the ordering channel. The displayed price is the price quoted to the
customer in the WhatsApp order message, so it is operational data and must be
kept accurate. It must never be presented as a paid, confirmed, or reserved
amount — a human confirms stock and total on WhatsApp.

`asin` and `amazon_url` are retained as nullable and unused. An earlier revision
of this design assumed an Amazon-redirect model; that is no longer current. The
columns stay so the channel can be re-enabled without a migration, but no UI
reads them and no validation should require them.

Indexes:
- slug
- active + sort_order
- featured + active
- category_id + active
- SKU
- ASIN

## 6. assets

Actual files live in Supabase Storage.

Recommended fields:

- id UUID primary key
- filename TEXT
- storage_bucket TEXT
- storage_path TEXT
- media_type TEXT (`image`, `video`, etc.)
- mime_type TEXT
- width INTEGER
- height INTEGER
- duration_seconds NUMERIC
- file_size_bytes BIGINT
- alt_text TEXT
- status TEXT (`active`, `archived`)
- created_by UUID
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

Constraints:
- file_size_bytes >= 0
- width/height positive when applicable
- unique storage path

Indexes:
- media_type
- status
- created_at
- created_by

## 7. product_assets

Join table between products and assets.

Fields:
- product_id UUID
- asset_id UUID
- role TEXT (`main`, `gallery`, `thumbnail`, `video`, etc.)
- sort_order INTEGER
- created_at TIMESTAMPTZ

Primary key:
- `(product_id, asset_id)`

Indexes:
- product_id + sort_order
- asset_id

Foreign keys:
- product_id → products.id
- asset_id → assets.id

Use explicit deletion behavior. Avoid accidental cascade deletion of shared assets.

## 8. reviews

Because ordering happens over WhatsApp rather than through an on-site checkout, the site cannot verify a purchase. Reviews shown on ZWIK are therefore marketing/content data, not verified-purchase reviews.

Fields:
- id UUID
- product_id UUID
- customer_display_name TEXT
- rating NUMERIC(2,1)
- review_text TEXT
- image_asset_id UUID nullable
- source TEXT
- is_featured BOOLEAN
- is_active BOOLEAN
- sort_order INTEGER
- created_at
- updated_at

Record where each review actually came from in `source` (e.g. WhatsApp conversation, Instagram, Amazon, direct) and preserve that attribution in the UI. Never imply a review was independently collected or purchase-verified on the ZWIK site when it was not.

## 9. hero_slides

Fields:
- id UUID
- asset_id UUID
- heading TEXT
- subheading TEXT
- cta_label TEXT
- cta_type TEXT
- cta_url TEXT
- is_active BOOLEAN
- sort_order INTEGER
- starts_at TIMESTAMPTZ nullable
- ends_at TIMESTAMPTZ nullable
- created_at
- updated_at

Indexes:
- active + sort_order
- starts_at/ends_at if scheduling is implemented

Validate CTA destinations. Avoid accepting arbitrary dangerous URL schemes.

## 10. site_settings

Use a controlled schema.

Possible fields:
- id UUID
- whatsapp_number *(required for ordering to function)*
- whatsapp_default_message
- whatsapp_enabled
- amazon_store_url *(retained, nullable, unused)*
- instagram_url
- contact_email
- brand_name
- default_seo_title
- default_seo_description
- updated_by
- updated_at

Do not store secrets in this general settings table.

If analytics IDs are stored here, distinguish public identifiers from secret credentials.

## 11. audit_logs

Fields:
- id UUID
- actor_id UUID nullable
- action TEXT
- entity_type TEXT
- entity_id UUID/text nullable
- before_data JSONB nullable
- after_data JSONB nullable
- metadata JSONB nullable
- created_at TIMESTAMPTZ

Audit important operations:
- Product create/update/archive
- Price changes
- Asset upload/archive/delete
- Homepage changes
- Settings changes — especially the WhatsApp number and enabled flag, which
  take ordering offline when wrong
- Role/security changes

Avoid storing passwords, tokens or unnecessary sensitive personal information in audit logs.

## 12. Relationships

profiles
  └── audit_logs

categories
  └── products

products
  ├── product_assets ── assets
  └── reviews

hero_slides
  └── assets

site_settings
  └── controlled global configuration

## 13. RLS Strategy

Enable RLS on all application tables.

Public read policies should expose only intended public content:
- Active products
- Active categories
- Active public assets/references
- Active reviews
- Active hero slides
- Public settings only

Admin writes:
- Require authenticated admin role.
- Insert/update/delete/archive only through authorized policies/server-side operations.

Do not create a broad policy such as:
`authenticated users can do everything`.

## 14. URL / Input Validation

For:
- slug
- WhatsApp number
- social URLs
- hero slide CTA URLs
- image metadata
- text content
- Amazon URL *(only if the channel is ever re-enabled)*

Validate server-side.

WhatsApp numbers must be normalised to digits only, including country code,
before being used to build a `wa.me` link.

Constrain any user-supplied URL to an allowed scheme (`http`/`https` or a
site-relative path). Reject `javascript:`, `data:`, and similar. If Amazon URLs
are reintroduced, additionally constrain them to expected Amazon domains.

Avoid open redirects.

## 15. Price Handling

Use `NUMERIC(12,2)` rather than floating-point database types.

Never calculate monetary values with binary floating point when exact currency arithmetic is required.

Currency should be explicit.

For the current Indian market:
- currency can default to INR,
- but the schema should not prevent future currencies.

## 16. Timestamps

Use `TIMESTAMPTZ`.

Store timestamps in UTC at the database layer.

Convert to local timezone only for presentation.

Do not render `new Date()` during SSR in a way that creates server/client hydration differences.

## 17. Soft Delete / Archival

Prefer `is_active` or a status such as `archived` for content that may need recovery.

Do not physically delete assets/products immediately if they may still be referenced.

For permanent deletion:
1. Verify references.
2. Authorize operation.
3. Remove dependent relationships safely.
4. Remove storage object if appropriate.
5. Record audit event.

### 17.1 Erasure is the exception

Content is archived, never deleted. Personal data is the deliberate exception:
deleting a `customers` row is the DPDP Act erasure path and must be a real hard
delete. An archive flag would leave the phone number in the database, which is
precisely what an erasure request asks you to remove.

The design makes this safe: because `orders` references the customer instead of
copying their details, and `orders.customer_id` is `on delete set null`, erasing
a person keeps the sales history in anonymous form.

## 18. Migration Discipline

Every schema change must be represented as a migration.

Never make undocumented production schema changes manually.

Before applying a migration:
- Review SQL.
- Check dependencies.
- Check RLS impact.
- Check indexes.
- Check backward compatibility where relevant.

## 19. Query Discipline

- Select only needed fields.
- Avoid N+1 queries.
- Use joins/relationships appropriately.
- Paginate admin lists.
- Use indexes for frequently filtered/sorted fields.
- Avoid unbounded queries.
- Do not fetch all assets/products into the browser.

## 20. Initial Build Order

Recommended database implementation order:

1. profiles / admin roles
2. categories
3. products
4. assets
5. product_assets
6. reviews
7. hero_slides
8. site_settings
9. audit_logs
10. RLS policies
11. indexes
12. seed/test data

Do not start by building UI forms against an unstable schema.

## 22. customers

Holds personal data. Added by migration 0012 — see ARCHITECTURE.md §5.1.

Fields:
- id UUID
- phone TEXT not null unique, digits only including country code
- name TEXT nullable
- city_and_pincode TEXT nullable
- marketing_consent BOOLEAN not null default false
- marketing_consent_at TIMESTAMPTZ nullable
- marketing_consent_source TEXT nullable
- unsubscribed_at TIMESTAMPTZ nullable
- admin_note TEXT nullable
- created_at
- updated_at

`phone` is the identity: a repeat buyer updates their row rather than creating a
second one. It is the only column with a uniqueness guarantee.

**Never give this table a public read policy.** The anon key is a public value,
so one would publish every buyer's phone number.

Consent rules:
- `marketing_consent` defaults to false. It is only ever set true by an explicit
  tick, and is never inferred from having placed an order.
- `unsubscribed_at` overrides `marketing_consent`. Both are stored so a record
  still shows that consent was once given and when it was withdrawn, and so a
  later re-tick in the cart cannot silently resurrect a withdrawn consent.
- Every send must check consent AND unsubscription. `canReceiveMarketing()` in
  `types/customer.ts` is the single place that decides.
- Admins may withdraw consent but not grant it; re-subscribing requires a stated
  source, recorded in the audit log.

Deleting a row is the DPDP Act erasure path (§17.1). It is a hard delete.

Indexes: phone (unique), created_at desc, (marketing_consent, unsubscribed_at).

## 23. orders

Fields:
- id UUID
- customer_id UUID nullable, references customers on delete set null
- status TEXT check in ('initiated','confirmed','cancelled','fulfilled')
- subtotal NUMERIC(12,2)
- delivery_charge NUMERIC(12,2) nullable
- delivery_label TEXT nullable
- total NUMERIC(12,2)
- currency TEXT default 'INR'
- gift_wrap BOOLEAN
- customer_note TEXT nullable
- source TEXT default 'website_cart'
- created_at, confirmed_at, cancelled_at, updated_at

`status` defaults to `initiated`, which means the site composed the order and
handed it to WhatsApp. It does **not** mean the order was placed: a `wa.me` link
only opens WhatsApp, and whether the customer pressed send is unobservable. Only
a human sets `confirmed`. Nothing may present an initiated row as a placed order.

`customer_id` is nullable for two distinct reasons — the customer entered no
phone number, or their record was later erased. The admin distinguishes them.

**Orders deliberately do not store the name or phone.** Duplicating them would
make erasure impossible without destroying business records. Contact details
live only on `customers`; deleting that row leaves an anonymous sales record.

`delivery_charge` null means the site did not quote a charge, and the customer
was shown "Confirmed on WhatsApp". It must never be coerced to 0 — `total` then
excludes delivery, and the UI says so.

Money is snapshotted at hand-off. Product prices change; what was quoted to this
customer must not change with them.

Indexes: customer_id, (status, created_at desc), created_at desc.

## 24. order_items

Fields:
- id UUID
- order_id UUID references orders on delete cascade
- product_id UUID nullable, references products on delete set null
- sku TEXT nullable
- name TEXT not null
- unit_price NUMERIC(12,2)
- qty INTEGER check > 0
- line_total NUMERIC(12,2)
- created_at

`name`, `sku` and `unit_price` are snapshots so a line still reads correctly
after the product is renamed, repriced or deleted. They are not personal data.

`on delete cascade` from orders: a line has no meaning without its order.
`on delete set null` from products: the line must outlive the product.

Indexes: order_id, product_id.

## 25. message_campaigns

Added by migration 0013.

Fields:
- id UUID
- name TEXT not null (internal label, never sent)
- body TEXT not null (may contain the `{name}` token)
- status TEXT check in ('draft','sending','completed','cancelled')
- created_by UUID references profiles
- created_at, updated_at, started_at, completed_at

`status = 'sending'` describes the admin, not the system: nothing here sends by
itself. The body is frozen once the audience is locked in, so two different
messages cannot go out under one campaign.

The opt-out line is NOT stored. `buildCampaignMessage` appends it at send time,
which is what makes it impossible to remove from a message.

## 26. campaign_recipients

Fields:
- id UUID
- campaign_id UUID references message_campaigns on delete cascade
- customer_id UUID nullable, references customers on delete set null
- status TEXT check in ('pending','sent','skipped')
- skip_reason TEXT nullable
- sent_at TIMESTAMPTZ nullable
- sent_by UUID references profiles
- created_at
- unique (campaign_id, customer_id)

The audience is snapshotted when a campaign starts, so progress is stable and a
customer created tomorrow does not join a send already in flight.

**Snapshotting the audience does not snapshot consent.** Consent is re-checked
live before any link is built and again before a row is marked sent; a customer
who unsubscribed in between is marked `skipped`, never messaged.

`status` is only ever set by a human. The site cannot observe WhatsApp delivery,
so an automated 'sent' would be a claim it has no basis for.

Indexes: (campaign_id, status), customer_id.

## 21. Future Extensions

Potential future tables, only when required:
- product_variants
- collections
- promotional_banners
- scheduled_content
- analytics_events
- media_processing_jobs

Do not create these prematurely.
