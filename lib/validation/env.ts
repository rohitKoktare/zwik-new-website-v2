import { z } from "zod";

/**
 * Treats a blank string the same as "unset".
 *
 * Blank, not omission, is the failure mode this guards against: a host's
 * dashboard (Vercel, etc.) can have an env var configured with no value typed
 * in, which reads back as `""`, not `undefined`. Zod's `.optional()` and
 * `.default()` only substitute for `undefined` — left unguarded, a blank
 * `NEXT_PUBLIC_SITE_URL` passed `.url()` validation's job to `new URL("")`
 * downstream instead, which threw `ERR_INVALID_URL` and took down the entire
 * production build (ironically, from inside app/layout.tsx's own attempt at a
 * `?? "http://localhost:3000"` fallback — `??` has the same blind spot).
 */
function blankToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    blankToUndefined,
    z.string().url().default("http://localhost:3000"),
  ),
});

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
  );
}

/**
 * Safe to import from client or server code — contains only NEXT_PUBLIC_ values.
 *
 * `supabaseUrl`/`supabaseAnonKey` are intentionally optional: this project ships
 * without a connected Supabase project by default. Code that reads from Supabase
 * must check `isSupabaseConfigured` and degrade gracefully (see lib/supabase).
 */
export const publicEnv = {
  supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  siteUrl: parsed.data.NEXT_PUBLIC_SITE_URL,
};

export const isSupabaseConfigured = Boolean(
  publicEnv.supabaseUrl && publicEnv.supabaseAnonKey,
);

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

/**
 * Server-only environment access. Import only from server-side modules
 * (lib/supabase/admin.ts guards this further with the `server-only` package).
 */
export function readServerEnv() {
  const result = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!result.success) {
    throw new Error("Invalid server environment variables");
  }

  return result.data;
}
