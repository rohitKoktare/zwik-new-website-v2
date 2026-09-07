# ZWIK Website — Architecture

## 1. System Goal

The ZWIK website is a premium D2C product-discovery and brand platform.

Customer purchase flow:

Customer
→ ZWIK website
→ Product
→ Add to cart
→ Cart drawer (contact details + gift-wrap preference)
→ “Send this order on WhatsApp”
→ WhatsApp conversation with ZWIK
→ ZWIK confirms stock and total, then shares payment details out-of-band

The website owns product discovery and order *composition*. It does not own
payment, shipping, or order fulfilment — those happen on WhatsApp and offline.

No payment is ever collected on the site. The cart is a message builder, not a
checkout: it produces a formatted WhatsApp message and hands the customer off.

Historical note: an earlier revision of this document described an
Amazon-redirect model (“Buy on Amazon”). That model is no longer current. The
`products.asin` and `products.amazon_url` columns are retained as nullable and
unused so the option stays open, but no UI reads them. See §18.

## 2. High-Level Architecture

Browser
  |
  v
Next.js application
  |
  +--> Public storefront
  |
  +--> Secure Admin
  |
  +--> Server/API layer
          |
          +--> Supabase Auth
          +--> Supabase PostgreSQL
          +--> Supabase Storage

Vercel hosts the Next.js application.

Supabase provides:
- Authentication
- PostgreSQL
- Row Level Security
- Storage

## 3. Application Areas

Public routes:
- `/`
- `/products`
- `/products/[slug]`
- `/about`
- `/bulk-gifting`
- `/contact`

The cart is not a route. It is a client-side drawer available from every page in
the `(store)` route group, so a customer never leaves the page they are browsing.

Admin routes:
- `/admin`
- `/admin/products`
- `/admin/assets`
- `/admin/homepage`
- `/admin/reviews`
- `/admin/settings`
- `/admin/audit-logs`

## 4. Frontend Architecture

Use Server Components by default.

Use Client Components for:
- Carousels
- Image galleries
- Horizontal scrolling controls
- Video interactions
- Admin forms
- Interactive filters
- Other browser-dependent interactions

Suggested layers:

app/
  Routing and page composition

sections/
  Homepage/editorial sections

components/store/
  Store-specific UI

components/admin/
  Admin-specific UI

components/ui/
  shadcn/ui primitives

lib/
  Infrastructure and business utilities

## 5. Data Flow

Public product:

Supabase
→ Server-side query
→ Next.js Server Component
→ Product UI

Admin product update:

Admin browser
→ Authenticated server action/API
→ Authorization check
→ Input validation
→ Supabase write
→ Audit log
→ Revalidation/cache invalidation
→ Public website reflects update

Customer order (WhatsApp hand-off):

Customer browser
→ Add to cart (client state, persisted to localStorage)
→ Cart drawer collects name / phone / city+pincode / note / gift-wrap
→ Order message composed client-side from cart lines + settings
→ `wa.me` deep link opened in a new tab
→ Conversation continues on WhatsApp

Deliberate properties of this flow:
- No account or login is required to order, and every cart field is optional.
- The WhatsApp number and default message come from `site_settings`, never from
  a hard-coded constant.
- Message text must be URL-encoded exactly once, at link-build time.

### 5.1 Order capture (migrations 0012, 0014)

An earlier revision of this document guaranteed that "the cart never reaches the
server, so no customer PII is stored by the site", and said that persisting
orders would be "a deliberate scope change — not an incremental tweak". That
scope change has now been made, so ZWIK can keep order records and run WhatsApp
campaigns. The guarantee above no longer holds and this section replaces it.

Pressing **Place order** in the cart calls `captureOrderAction`
(`lib/store/orders/capture.ts`), which writes `customers`, `orders` and
`order_items` and returns the order number and tracking token. The on-site press
is what places the order; WhatsApp is a follow-up offered in the confirmation
dialog, not the act that constitutes the order. Six properties are load-bearing:

1. **A database failure must not cost the sale.** The action *is* now awaited —
   an earlier revision of this section promised it never would be, because the
   CTA was an anchor straight to `wa.me` and a tab opened after an awaited call
   loses the user gesture and gets eaten by the popup blocker. Moving WhatsApp
   behind a second click *inside* the dialog removed that constraint, and
   awaiting is unavoidable if the dialog is to show an order number.

   The replacement guarantee is weaker but explicit: every failure path returns
   rather than throws, and on failure the dialog still opens with the WhatsApp
   link, the copy-the-summary fallback, and the cart **left intact** so the
   order can be retried. It simply carries no order number, and none is
   invented — a fabricated reference would send the customer to WhatsApp quoting
   something ZWIK cannot look up. Verified by
   `EXPECT_DB_FAILURE=1 npm run check:checkout` against a dev server started
   with a deliberately broken service-role key.

2. **No money is trusted from the client.** The POST carries product ids and
   quantities only. Prices, the delivery charge and the totals are re-derived
   server-side from `products` and `site_settings`. Accepting a posted price
   would let anyone record an order claiming a ₹1 product, and ZWIK reads these
   rows to fulfil.

3. **Writes use the service-role client.** `customers`, `orders` and
   `order_items` have no client-writable RLS policy at all, which is what stops
   the anon key forging or enumerating orders. The server action is the trust
   boundary that replaces those policies.

4. **An order is not a *confirmed* order.** `initiated` no longer means "we
   can't tell whether they sent it" — the customer did press Place order, so the
   row is not speculative. It now means "placed on site, not yet agreed with the
   customer", which is why the admin label is **"Placed, unconfirmed"** rather
   than the old "Started on site". What stays unobservable is whether ZWIK can
   actually fulfil it: availability, the final delivery charge and payment are
   all settled by a human on WhatsApp, and only a human may move a row to
   `confirmed`. Nothing customer-facing may imply the order is paid or reserved
   (§18), which is why the tracking page says so in as many words.

5. **Contact details live in exactly one place.** `orders` deliberately does not
   copy the name or phone; both live on `customers`. Deleting a customer erases
   the personal data while `orders.customer_id` goes null, so the sales record
   survives anonymously. That is the erasure path (§16.1). A side effect worth
   knowing: an erased customer also loses tracking access, because the lookup
   has nothing left to match. That is correct, and the page must answer "not
   found" rather than hint that a record once existed.

6. **The tracking URL is a capability, not an identifier.**
   `orders.public_token` is a separate `uuid`, not the primary key: §18 forbids
   putting internal ids in a message, and a distinct token can be rotated if a
   link leaks. Its page (`app/(store)/orders/[token]/page.tsx`) is `noindex` and
   `force-dynamic` — the `(store)` layout's `revalidate = 3600` would otherwise
   put a URL that *is* a credential into the ISR cache, and serve a stale status
   with it. It reads through a service-role query
   (`lib/store/orders/lookup.ts`) that returns a deliberately narrowed view:
   no name, phone, city, internal id or admin note. Status labels come from a
   customer-facing map, kept separate from the admin one because the admin hints
   are written in admin voice ("You have spoken to the customer") and must not
   leak. The token is never logged.

Order numbers (`ZW-YYMM-NNNN`) come from `next_order_number()`, a
`security definer` function doing `insert ... on conflict do update ... returning`
against `order_number_counters` — atomic, so concurrent checkouts cannot collide
(proved with 50 concurrent inserts). The period is `YYMM` in `Asia/Kolkata`, so
months break on IST rather than UTC. Gaps are expected and harmless: a number is
consumed even if the order is later deleted. It is an identifier, not a ledger.

### 5.2 Outbound messaging

The site cannot send messages to customers. `wa.me` is outbound *from* the
customer only. Sending a thank-you or a campaign from ZWIK requires the WhatsApp
Business Platform (Cloud API), which this project has no credentials for. Until
it does, the admin's "Open WhatsApp reply" buttons prefill a message that a
human then sends — see §18.

## 6. Authentication

Supabase Auth is the source of truth for admin authentication.

Admin access must be checked server-side.

Do not implement a second authentication system.

Future roles can include:
- SUPER_ADMIN
- ADMIN
- CONTENT_MANAGER

The initial implementation may use ADMIN if fewer roles are needed, but database/authorization design should not prevent future role expansion.

## 7. Database

PostgreSQL is the system of record for:
- Products
- Product assets/relationships
- Assets metadata
- Categories
- Reviews
- Homepage content
- Homepage slides
- Settings
- Admin role/profile information
- Audit logs

Actual media files are stored in Supabase Storage.

## 8. Storage

Use Supabase Storage for website media initially.

Suggested logical paths:

products/{product-id}/...
heroes/...
homepage/...
videos/{product-id}/...
brand/...
general/...

Prefer unique storage keys and avoid using user-provided filenames directly.

The database stores asset metadata and references, not binary file contents.

## 9. Asset Lifecycle

Upload:
Admin
→ authenticate
→ authorize
→ validate
→ upload to Storage
→ save asset metadata
→ optionally associate with product/content

Replace:
New validated asset
→ update relationship/reference
→ preserve old asset temporarily if rollback is useful
→ archive/delete old asset according to retention rules

Delete:
Authorize
→ check references
→ archive/delete database record
→ remove storage object when safe

Do not delete a shared asset that is still referenced.

## 10. Content Management

Frequently changing content should be database-driven.

Manage through Admin:
- Hero slides
- Featured products
- Product information
- Product price display
- Product images
- Product video
- Reviews
- WhatsApp settings (number, default message, enabled)
- Social links
- SEO defaults
- Homepage sections

WhatsApp settings are load-bearing, not cosmetic: if the number is missing or
WhatsApp is disabled, the site has no way to take an order. Treat changes to
them as production-affecting and audit them.

Stable application behavior remains in code.

## 11. Product Model Concept

Product:
- id
- sku
- asin *(retained, nullable, unused — see §1)*
- name
- slug
- short_description
- description
- features
- category_id
- price
- original_price
- currency
- amazon_url *(retained, nullable, unused — see §1)*
- rating
- review_count
- is_featured
- is_active
- sort_order
- created_at
- updated_at

`price` is the price quoted to the customer in the WhatsApp order message. It is
the number the business is expected to honour on that conversation, so it is
operational data, not decorative marketing copy.

Use structured relational tables where relationships are important. JSON/arrays may be used for genuinely flexible content such as feature lists when appropriate.

## 12. Asset Model Concept

Asset:
- id
- filename
- storage_path
- media_type
- mime_type
- width
- height
- duration_seconds
- file_size_bytes
- alt_text
- status
- created_by
- created_at
- updated_at

ProductAsset:
- product_id
- asset_id
- role
- sort_order

This allows the same asset system to support products, hero slides and homepage content.

## 13. Homepage Model Concept

HeroSlide:
- id
- asset_id
- heading
- subheading
- cta_label
- cta_type
- cta_url
- is_active
- sort_order
- starts_at
- ends_at
- created_at
- updated_at

Featured products should reference Product IDs rather than duplicate product data.

## 14. Settings

Use a controlled settings model for:
- WhatsApp number *(required for ordering to work)*
- WhatsApp default message
- WhatsApp enabled flag
- Free-delivery threshold, scope note and flat delivery fee *(see below)*
- Instagram URL
- Contact email
- Brand metadata
- SEO defaults
- Analytics IDs
- Amazon store URL *(retained, nullable, unused — see §1)*

Delivery terms are operational, not decorative: the flat fee is quoted inside
the WhatsApp order message, so it is a number the business is expected to
honour. Both delivery amounts are nullable, and null is a meaningful state —
no threshold means no offer is advertised, and no fee means the cart says
delivery is confirmed on WhatsApp rather than inventing a charge. All delivery
reasoning lives in `lib/store/delivery.ts`; the cart, footer, ticker, product
page and order message all read from it so they cannot disagree.

Do not turn settings into an unrestricted key-value store unless there is a strong reason.

## 15. Caching / Revalidation

Public product/content data can be cached/revalidated.

Admin updates must trigger the appropriate Next.js cache invalidation/revalidation so changes appear without requiring a full deployment.

Do not disable caching globally simply to make updates appear immediately.

## 16. Security Boundaries

Public:
- Read only what is intentionally public.

Admin:
- Authenticated.
- Authorized.
- Validated.
- Audited.

Server-only:
- Service-role credentials
- Privileged operations
- Sensitive configuration

Never expose privileged credentials to client code.

### 16.1 Personal data

`customers` and `orders` hold personal data. Rules, not preferences:

- **No public read policy on either table, ever.** One would expose every
  buyer's phone number to anyone holding the anon key, which is a public value.
- Personal data is never copied into `audit_logs`. Those rows are long-lived and
  readable by every admin, so `scrub()` redacts phone- and email-like keys and
  the customer actions log facts about a change rather than the values.
- **Erasure must stay possible.** India's DPDP Act 2023 gives a person the right
  to have their personal data deleted. Deleting a `customers` row is that path,
  which is why it is a hard delete rather than an archive flag, and why orders
  reference the customer instead of duplicating their details.
- Marketing consent is separate from ordering. Placing an order is consent to be
  contacted about that order and nothing more.

## 17. Observability

Centralized logging should distinguish:
- Application errors
- Security events
- Admin actions
- Operational events

Audit logs are separate from ordinary application logs.

## 18. External Integrations

WhatsApp — the primary ordering channel.

**`wa.me` is a deep link, not an API.** It opens WhatsApp on the *customer's*
device with a prefilled message addressed to ZWIK. It cannot deliver anything to
a customer, confirm that a message was sent, or send in bulk. Every "message the
customer" feature in the admin is therefore a prefilled link a human sends.

Automated thank-yous and campaign broadcasts require the WhatsApp Business
Platform (Cloud API), which brings its own constraints: a verified Meta Business
account and a registered WhatsApp Business number; message *templates*
pre-approved by Meta for anything outside the 24-hour window that opens when a
customer messages first; prior opt-in for marketing templates; and per-message
billing. Sending marketing without consent gets the number restricted or banned
under Meta's Business Messaging Policy — which is why `customers.marketing_consent`
and `unsubscribed_at` gate every send rather than being advisory.

Ordering specifics:
- The order hand-off and all “ask us” links are generated from centrally
  managed settings, never from a hard-coded number.
- The message must be URL-encoded exactly once, at link-build time.
- Never place secrets, internal IDs, or another customer's data in a message.
- The site must degrade honestly when WhatsApp is unconfigured or disabled:
  hide or disable the ordering affordance rather than render a dead link.
- ZWIK confirms stock, total, and payment on WhatsApp. The site must not imply
  an order is confirmed, reserved, or paid.

Amazon — not currently used:
- ZWIK does not link out to Amazon and does not implement Amazon checkout.
- `asin`, `amazon_url`, and `amazon_store_url` remain in the schema as nullable
  and unused so the channel can be re-enabled without a migration.
- If Amazon is ever re-introduced, it is an *additional* channel alongside
  WhatsApp and must be specified deliberately — do not treat the leftover
  columns as evidence that the feature is half-built.

Social platforms:
- Store links in settings.
- Do not expose private credentials.

## 19. Scalability Path

Current:
Next.js + Supabase Auth + Supabase PostgreSQL + Supabase Storage + Vercel

Later, if requirements justify it:
- Dedicated CDN/video service
- More advanced analytics
- WhatsApp Business Platform (Cloud API) for automated replies and campaigns,
  instead of prefilled `wa.me` links a human sends
- Stock decrementing and fulfilment tracking on the persisted `orders` entity
- Rate limiting on `captureOrderAction`, the one anonymous write path
- Multiple admin roles
- Advanced search
- Additional markets
- Re-introducing Amazon as a secondary channel

Do not prematurely introduce these.

## 20. Architectural Rule

Keep the architecture boring, explicit and maintainable.

The project should be easy for another developer to understand without needing to reverse-engineer AI-generated abstractions.
