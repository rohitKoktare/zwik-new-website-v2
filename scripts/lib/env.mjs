import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal .env.local reader for the setup scripts. Deliberately dependency-free
 * — these scripts run before/around the app and should not need node_modules
 * beyond @supabase/supabase-js, which the project already depends on.
 */
export function loadEnv(projectRoot = process.cwd()) {
  const envPath = resolve(projectRoot, ".env.local");

  if (!existsSync(envPath)) {
    fail(
      `No .env.local found at ${envPath}\n` +
        `Copy .env.example to .env.local and fill in your Supabase project details first.`,
    );
  }

  const parsed = {};
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

export function requireVars(env, keys) {
  const missing = keys.filter((key) => !env[key]);

  if (missing.length > 0) {
    fail(
      `Missing required environment variable(s) in .env.local:\n` +
        missing.map((key) => `  - ${key}`).join("\n"),
    );
  }

  return Object.fromEntries(keys.map((key) => [key, env[key]]));
}

export function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

export function ok(message) {
  console.log(`✓ ${message}`);
}

export function info(message) {
  console.log(`  ${message}`);
}
