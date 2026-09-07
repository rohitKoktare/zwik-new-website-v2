# Supabase setup

Thirteen migrations plus three helper scripts take the project from "no backend" to a
working storefront and admin panel.

> **Status: 0001–0010 applied and verified. `0011`, `0012` and `0013` are PENDING.**
>
> Neither has been applied — the Supabase CLI is not linked in this workspace,
> so both need your login:
>
> ```bash
> npx supabase link --project-ref <your-project-ref>
> npm run db:push
> ```
>
> Until then:
>
> - **0011** — the delivery fields in `/admin/settings` are disabled and the
>   storefront shows no free-delivery messaging. Both settings queries detect the
>   missing columns (`42703`), retry without them and log a warning, so the
>   WhatsApp number — the only way to order — is never taken down by the pending
>   migration.
> - **0012** — order capture logs a failure and `/admin/orders` and
>   `/admin/customers` show empty. Ordering is unaffected: the capture is fired
>   without being awaited and never blocks the WhatsApp hand-off, by design
>   (ARCHITECTURE.md §5.1).
> - **0013** — `/admin/campaigns` shows empty and no campaign can be created.
>   Depends on 0012, since the audience comes from `customers`.
>
> Neither pending migration can break the storefront or stop a customer ordering.
> That is deliberate, not luck.
>
> A Supabase project is connected via
> `Website4/.env.local`, migrations 0001–0010 are live, and `npm run verify:setup`
> passes: 9 tables, 4 categories, 5 products, 14 assets, 14 Storage objects,
> anonymous writes blocked by RLS, 1 active admin, WhatsApp ordering configured.
>
> The steps below are kept as the from-scratch runbook (a second environment, or
> a rebuild). They are idempotent and safe to re-run against the current
> project. **Never edit a migration that has already been applied** — add
> `00NN_description.sql` instead.

---

## What you need to do first (requires your account)

Creating the project itself can't be automated from here — it needs your
Supabase login and an organization to bill against.

1. Create a project at <https://supabase.com/dashboard> (region: choose one near
   your customers; for India, Mumbai `ap-south-1`).
2. In **Project Settings → API**, copy:
   - Project URL
   - `anon` / public key
   - `service_role` key (secret)
3. Create `.env.local` in `Website4/`:

   ```bash
   cp .env.example .env.local
   ```

   Fill in all four values. `SUPABASE_SERVICE_ROLE_KEY` is **required** for the
   admin panel — `audit_logs` is append-only from trusted server code and has no
   INSERT policy, so admin actions cannot be audited without it.

---

## Then run these

```bash
# 1. Apply the schema (10 migrations, in order)
npx supabase link --project-ref <your-project-ref>
npx supabase db push

# 2. Upload the seed product photography into Storage.
#    REQUIRED — migration 0009 seeds asset rows pointing at these paths, and
#    once Supabase is configured the app stops serving them from /public.
npm run seed:storage

# 3. Create your admin account (prints a one-time password if the user is new)
npm run create:admin -- you@example.com "Your Name" SUPER_ADMIN

# 4. Confirm everything is actually wired up
npm run verify:setup
```

`verify:setup` is worth reading — beyond checking tables exist it actively tries
to write to `products` with the anonymous key and fails loudly if RLS lets it
through. A broken policy is otherwise invisible until someone exploits it.

Then `npm run dev` and sign in at <http://localhost:3000/admin/login>.

---

## Migrations

| File | Contents |
| --- | --- |
| `0001_profiles.sql` | `profiles` + the `is_admin()` helper every other policy depends on |
| `0002_categories.sql` | `categories` |
| `0003_products.sql` | `products` |
| `0004_assets_and_product_assets.sql` | `assets`, `product_assets` |
| `0005_reviews.sql` | `reviews` |
| `0006_hero_slides.sql` | `hero_slides` |
| `0007_site_settings.sql` | `site_settings` (singleton) |
| `0008_audit_logs.sql` | `audit_logs` (admin-read, service-role-write) |
| `0009_seed_categories_products.sql` | Real catalog: 4 categories, 5 products, 14 images |
| `0010_storage_bucket.sql` | `product-media` bucket + Storage RLS + MIME/size limits |
| `0011_delivery_settings.sql` | Delivery terms on `site_settings`: free-delivery threshold, scope note, flat fee |
| `0012_customers_and_orders.sql` | `customers`, `orders`, `order_items` — personal data, admin-only RLS |
| `0013_message_campaigns.sql` | `message_campaigns`, `campaign_recipients` — consent-gated campaign worklist |

Every table has RLS enabled with public-read / admin-write policies. There is no
`authenticated users can do everything` policy anywhere — writes require an
active admin profile via `is_admin()`.

### Deliberately not seeded: reviews

`0009` seeds categories, products and assets, but **no reviews**. The reviews in
the original design mock are labelled placeholders, and `DATABASE_DESIGN.md` §8
forbids presenting a review as genuine when it isn't. Add real ones through
`/admin/reviews`, recording where each actually came from.

The homepage renders a review only when it is both **active** and **featured**,
so a newly added review stays invisible until you feature it.

---

## Notes

- **`asin` / `amazon_url` / `amazon_store_url`** exist but are unused. ZWIK sells
  via WhatsApp, not Amazon (`ARCHITECTURE.md` §1 and §18). They're retained as
  nullable so the channel could be re-enabled without a migration; no UI reads
  them.
- **Storage vs `/public`** — `lib/storage/resolve-asset-url.ts` is the only place
  that builds a media URL. With Supabase configured it returns Storage URLs;
  without it, it falls back to `/public/products` so the storefront still renders
  locally. That's why step 2 above isn't optional.
- **Adding a migration** — create `00NN_description.sql`, keep it idempotent
  (`if not exists`, `on conflict do nothing`), and review its RLS impact before
  pushing. Never edit a migration that has already been applied.
