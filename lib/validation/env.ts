import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
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
