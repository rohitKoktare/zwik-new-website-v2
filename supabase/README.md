# Supabase setup

Thirteen migrations plus three helper scripts take the project from "no backend" to a
working storefront and admin panel.

> **Status: all thirteen migrations applied and verified.** `npm run verify:setup`
> passes with no pending migrations: 14 tables total (9 core + `customers`,
> `orders`, `order_items`, `message_campaigns`, `campaign_recipients`), 4
> categories, 5 products, 14 assets, 14 Storage objects, anonymous writes
> blocked by RLS, 1 active admin, WhatsApp ordering configured.
>
> The steps below are kept as the from-scratch runbook (a second environment, or
> a rebuild). They are idempotent and safe to re-run against the current
> project. **Never edit a migration that has already been applied** — add
> `00NN_description.sql` instead.

### If `supabase db push` fails with "policy already exists" on migration 0001

This happened once on this project and is worth knowing about before it
surprises you again. `supabase migration list` will show every migration with an
empty `remote` column even though the tables plainly exist — check with
`npm run verify:setup`.

Cause: 0001–0010 were originally applied by running `supabase/ALL_MIGRATIONS.sql`
directly (dashboard SQL editor or `psql`), not through the CLI. The tables and
policies are real, but the CLI's own bookkeeping table
(`supabase_migrations.schema_migrations`) has no record of it — so `db push`
assumes nothing has run and tries 0001 again, colliding with a policy that's
already there.

Fix: tell the CLI those versions are already applied, without re-running them,
then push only what's actually new:

```bash
npx supabase migration repair --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010
npx supabase migration list   # confirm local and remote now match for 0001–0010
npm run db:push               # applies only what's left
```

Never run `migration repair` on a version that has *not* actually been applied
to the database — that would make the CLI skip it forever.

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
| `0014_order_numbers_and_tracking.sql` | `orders.order_number` + `orders.public_token`, `order_number_counters` and the atomic `next_order_number()` |

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
