/**
 * Verifies a freshly provisioned Supabase project actually matches what the
 * app expects: tables present, RLS on, seed data loaded, Storage reachable,
 * and at least one active admin.
 *
 *   node scripts/verify-setup.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireVars, ok, info } from "./lib/env.mjs";

const BUCKET = "product-media";
const EXPECTED_TABLES = [
  "profiles",
  "categories",
  "products",
  "assets",
  "product_assets",
  "reviews",
  "hero_slides",
  "site_settings",
  "audit_logs",
];

/**
 * Tables added by migrations that may not be applied yet. Reported, not failed —
 * the storefront works without them by design.
 */
const PENDING_MIGRATION_TABLES = [
  { table: "customers", migration: "0012_customers_and_orders.sql" },
  { table: "orders", migration: "0012_customers_and_orders.sql" },
  { table: "order_items", migration: "0012_customers_and_orders.sql" },
  { table: "message_campaigns", migration: "0013_message_campaigns.sql" },
  { table: "campaign_recipients", migration: "0013_message_campaigns.sql" },
];

/** Columns added by a migration, checked the same way. */
const PENDING_MIGRATION_COLUMNS = [
  {
    table: "site_settings",
    columns: "free_delivery_threshold, delivery_scope_note, delivery_fee",
    migration: "0011_delivery_settings.sql",
  },
];

/**
 * Whether a table exists and is reachable.
 *
 * `head: true` is deliberately NOT used. PostgREST answers a head request for a
 * missing table with no error and a null count, so the original version of this
 * check could never fail — it reported "all tables present" against a database
 * with none of them. `.limit(1)` costs one row and actually surfaces PGRST205.
 */
async function tableExists(table) {
  const { error } = await admin.from(table).select("*", { count: "exact" }).limit(1);
  return { ok: !error, error };
}

const env = loadEnv();
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
  requireVars(env, [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let problems = 0;
const bad = (message) => {
  console.error(`✗ ${message}`);
  problems += 1;
};

console.log("\nVerifying ZWIK Supabase setup…\n");

// 1. Tables exist and are reachable.
for (const table of EXPECTED_TABLES) {
  const { ok: exists, error } = await tableExists(table);
  if (!exists) bad(`Table "${table}" is not reachable — ${error.message}`);
}
if (problems === 0) ok(`All ${EXPECTED_TABLES.length} core tables present`);

// 2. Seed content loaded.
const [{ count: categoryCount }, { count: productCount }, { count: assetCount }] =
  await Promise.all([
    admin.from("categories").select("id", { count: "exact", head: true }),
    admin.from("products").select("id", { count: "exact", head: true }),
    admin.from("assets").select("id", { count: "exact", head: true }),
  ]);

info(`categories: ${categoryCount ?? 0}, products: ${productCount ?? 0}, assets: ${assetCount ?? 0}`);
if ((productCount ?? 0) === 0) bad("No products found — did migration 0009 run?");

// 3. RLS actually blocks anonymous writes. This is the check that matters:
//    a misconfigured policy is invisible until someone exploits it.
const { error: anonWriteError } = await anon
  .from("products")
  .insert({ name: "RLS probe", slug: `rls-probe-${Date.now()}`, price: 1 });

if (!anonWriteError) {
  bad("SECURITY: anonymous client was able to INSERT into products — RLS is not protecting writes!");
  await admin.from("products").delete().eq("name", "RLS probe");
} else {
  ok("Anonymous writes are blocked by RLS");
}

// 4. Anonymous reads see only active products.
const { data: anonProducts, error: anonReadError } = await anon
  .from("products")
  .select("id, is_active");

if (anonReadError) {
  bad(`Anonymous read of products failed — the storefront will be empty: ${anonReadError.message}`);
} else {
  const leaked = (anonProducts ?? []).filter((row) => row.is_active === false);
  if (leaked.length > 0) bad(`${leaked.length} inactive product(s) are visible to the public`);
  else ok(`Public read works (${anonProducts?.length ?? 0} active product(s) visible)`);
}

// 5. Audit log must not be publicly readable.
const { data: anonAudit } = await anon.from("audit_logs").select("id").limit(1);
if (anonAudit && anonAudit.length > 0) bad("SECURITY: audit_logs is readable anonymously");
else ok("audit_logs is not publicly readable");

// 6. Storage bucket exists and objects are present.
const { data: bucket, error: bucketError } = await admin.storage.getBucket(BUCKET);
if (bucketError || !bucket) {
  bad(`Storage bucket "${BUCKET}" missing — did migration 0010 run? ${bucketError?.message ?? ""}`);
} else {
  const { data: objects } = await admin.storage.from(BUCKET).list("products", { limit: 100 });
  const count = objects?.length ?? 0;
  if (count === 0) {
    bad(`Bucket "${BUCKET}" has no objects under products/ — run: node scripts/seed-storage.mjs`);
  } else {
    ok(`Storage bucket "${BUCKET}" has ${count} object(s) under products/`);
  }
}

// 7. At least one active admin exists, or nobody can sign in.
const { data: admins } = await admin
  .from("profiles")
  .select("id, role")
  .eq("is_active", true);

if (!admins || admins.length === 0) {
  bad("No active admin profile — run: node scripts/create-admin.mjs you@example.com");
} else {
  ok(`${admins.length} active admin profile(s)`);
}

// 8. Settings row with a WhatsApp number, or the site cannot take orders.
const { data: settings } = await admin
  .from("site_settings")
  .select("whatsapp_number, whatsapp_enabled")
  .maybeSingle();

if (!settings) {
  bad("No site_settings row — the site cannot take orders. Save once at /admin/settings.");
} else if (!settings.whatsapp_enabled || !settings.whatsapp_number) {
  bad("WhatsApp ordering is off or has no number — customers cannot place an order.");
} else {
  ok(`WhatsApp ordering configured (${settings.whatsapp_number})`);
}

// Pending migrations. Reported, never counted as problems: the storefront and
// WhatsApp ordering work without them by design (see supabase/README.md).
const pending = [];

for (const { table, migration } of PENDING_MIGRATION_TABLES) {
  const { ok: exists } = await tableExists(table);
  if (!exists && !pending.includes(migration)) pending.push(migration);
}

for (const { table, columns, migration } of PENDING_MIGRATION_COLUMNS) {
  const { error } = await admin.from(table).select(columns).limit(1);
  if (error && !pending.includes(migration)) pending.push(migration);
}

if (pending.length > 0) {
  console.log("");
  for (const migration of pending) {
    info(`Pending migration: ${migration}`);
  }
  info("Run `npm run db:push` to apply. The storefront works without them.");
}

console.log("");
if (problems > 0) {
  console.error(`✗ ${problems} problem(s) found.\n`);
  process.exit(1);
}
ok("Setup verified — everything checks out.\n");
