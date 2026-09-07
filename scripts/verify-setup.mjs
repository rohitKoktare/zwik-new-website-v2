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
  { table: "order_number_counters", migration: "0014_order_numbers_and_tracking.sql" },
];

/**
 * Tables the anon key must never read a single row from.
 *
 * These hold personal data and sales records, protected by having no
 * client-readable RLS policy at all rather than by a restrictive one. That is
 * easy to undo by accident — adding one permissive policy while debugging is
 * enough — and the damage is invisible until someone enumerates it.
 */
const PRIVATE_TABLES = [
  "customers",
  "orders",
  "order_items",
  "message_campaigns",
  "campaign_recipients",
  "order_number_counters",
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

/*
 * 5b. Personal data and sales records must be invisible to the anon key.
 *
 * Compared against a service-role read rather than just asserting "anon saw
 * nothing": with RLS on and no policies, PostgREST returns an empty array and
 * no error, which is indistinguishable from an empty table. So a table the
 * service role also finds empty is reported as inconclusive, not as a pass —
 * claiming a security check passed when it could not have failed is how the
 * old head:true table check went wrong.
 */
for (const table of PRIVATE_TABLES) {
  const [{ data: anonRows, error: anonError }, { count: realCount }] = await Promise.all([
    anon.from(table).select("*").limit(1),
    admin.from(table).select("*", { count: "exact", head: true }),
  ]);

  if (anonRows && anonRows.length > 0) {
    bad(`SECURITY: ${table} is readable anonymously — it holds data the public must not see`);
  } else if ((realCount ?? 0) === 0) {
    info(`${table} is empty, so its read-isolation check proves nothing yet`);
  } else if (anonError) {
    ok(`${table} is not publicly readable (${realCount} row(s) hidden)`);
  } else {
    ok(`${table} is not publicly readable (${realCount} row(s) hidden, 0 returned to anon)`);
  }
}

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
