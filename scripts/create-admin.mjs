/**
 * Creates (or promotes) an admin user.
 *
 * profiles has no INSERT policy by design — provisioning an admin is a
 * privileged server-side operation, so it runs here with the service-role key
 * rather than from the app.
 *
 *   node scripts/create-admin.mjs you@example.com "Your Name" [ROLE]
 *
 * ROLE defaults to ADMIN. Valid: SUPER_ADMIN | ADMIN | CONTENT_MANAGER
 *
 * If the email already exists in Supabase Auth, its profile is created/updated.
 * If it does not exist, the user is created and a one-time password is printed
 * — change it immediately after first sign-in.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireVars, fail, ok, info } from "./lib/env.mjs";

const VALID_ROLES = ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"];

const [email, displayName, roleArg] = process.argv.slice(2);
const role = (roleArg ?? "ADMIN").toUpperCase();

if (!email || !email.includes("@")) {
  fail(
    `Usage: node scripts/create-admin.mjs <email> ["Display Name"] [ROLE]\n` +
      `  ROLE: ${VALID_ROLES.join(" | ")} (default ADMIN)`,
  );
}

if (!VALID_ROLES.includes(role)) {
  fail(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`);
}

const env = loadEnv();
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = requireVars(env, [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("");

// Find an existing auth user with this email.
let userId = null;
let page = 1;

while (page <= 20) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) fail(`Could not list users: ${error.message}`);

  const match = data.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  );
  if (match) {
    userId = match.id;
    break;
  }

  if (data.users.length < 1000) break;
  page += 1;
}

let generatedPassword = null;

if (userId) {
  ok(`Found existing auth user for ${email}`);
} else {
  generatedPassword = `${randomBytes(12).toString("base64url")}Aa1!`;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: generatedPassword,
    email_confirm: true,
  });

  if (error) fail(`Could not create auth user: ${error.message}`);

  userId = data.user.id;
  ok(`Created auth user for ${email}`);
}

// Upsert the profile. This is what actually grants admin access — an auth user
// with no active profile row is rejected at sign-in.
const { error: profileError } = await supabase.from("profiles").upsert(
  {
    id: userId,
    display_name: displayName || email.split("@")[0],
    role,
    is_active: true,
    updated_at: new Date().toISOString(),
  },
  { onConflict: "id" },
);

if (profileError) {
  fail(
    `Auth user exists but the profile could not be written: ${profileError.message}\n` +
      `Have migrations 0001–0010 been applied?`,
  );
}

ok(`Profile set: role=${role}, active=true`);

if (generatedPassword) {
  console.log("");
  console.log("  ─────────────────────────────────────────────");
  console.log("  One-time password (change after first login):");
  console.log(`  ${generatedPassword}`);
  console.log("  ─────────────────────────────────────────────");
  console.log("");
  info("This is printed once and is not stored anywhere.");
} else {
  info("Existing password unchanged.");
}

console.log("");
ok(`Sign in at /admin/login as ${email}`);
console.log("");
