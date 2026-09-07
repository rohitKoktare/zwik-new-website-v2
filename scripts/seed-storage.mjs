/**
 * Uploads the seed product photography from public/products/ into the
 * Supabase Storage bucket used by the app.
 *
 * WHY THIS IS REQUIRED, NOT OPTIONAL:
 * migration 0009 seeds `assets` rows whose storage_path values look like
 * `products/<filename>.jpg`. Once Supabase is configured, resolveAssetUrl()
 * stops falling back to /public and starts returning Storage URLs. Without
 * running this, every seeded product image 404s.
 *
 * Idempotent — safe to re-run (uses upsert).
 *
 *   node scripts/seed-storage.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireVars, fail, ok, info } from "./lib/env.mjs";

const BUCKET = "product-media";
const SOURCE_DIR = resolve(process.cwd(), "public/products");
const DESTINATION_PREFIX = "products";

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const env = loadEnv();
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = requireVars(env, [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let files;
try {
  files = readdirSync(SOURCE_DIR).filter((name) => extname(name).toLowerCase() in CONTENT_TYPES);
} catch {
  fail(`Could not read ${SOURCE_DIR}. Run this from the Website4 directory.`);
}

if (files.length === 0) fail(`No uploadable media found in ${SOURCE_DIR}`);

console.log(`\nUploading ${files.length} file(s) to "${BUCKET}"…\n`);

let uploaded = 0;
let failed = 0;

for (const filename of files) {
  const contentType = CONTENT_TYPES[extname(filename).toLowerCase()];
  const body = readFileSync(resolve(SOURCE_DIR, filename));
  const key = `${DESTINATION_PREFIX}/${filename}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, body, { contentType, upsert: true });

  if (error) {
    console.error(`  ✗ ${key} — ${error.message}`);
    failed += 1;
  } else {
    info(`✓ ${key}`);
    uploaded += 1;
  }
}

console.log("");

if (failed > 0) {
  fail(
    `${failed} file(s) failed to upload.\n` +
      `Check that migration 0010_storage_bucket.sql has been applied (it creates the "${BUCKET}" bucket).`,
  );
}

ok(`Uploaded ${uploaded} file(s).`);

// Verify the seeded asset rows line up with what is now actually in Storage.
const { data: assets, error: assetsError } = await supabase
  .from("assets")
  .select("storage_path")
  .eq("storage_bucket", BUCKET);

if (assetsError) {
  console.warn(`\n! Could not verify assets rows: ${assetsError.message}`);
} else {
  const storedKeys = new Set(files.map((name) => `${DESTINATION_PREFIX}/${name}`));
  const orphaned = (assets ?? []).filter((row) => !storedKeys.has(row.storage_path));

  if (orphaned.length > 0) {
    console.warn(
      `\n! ${orphaned.length} assets row(s) reference a storage path with no uploaded object:`,
    );
    for (const row of orphaned) console.warn(`    ${row.storage_path}`);
    console.warn(`  Those images will 404 until the files are uploaded.`);
  } else {
    ok(`All ${assets?.length ?? 0} assets row(s) have a matching object in Storage.`);
  }
}

console.log("");
