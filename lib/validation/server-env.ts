import "server-only";
import { z } from "zod";

/**
 * Server-only environment access, split out of lib/validation/env.ts so the
 * `server-only` guard covers exactly this and nothing else. env.ts's
 * `publicEnv`/`isSupabaseConfigured` are legitimately safe for client code
 * (lib/supabase/client.ts, the browser-side Supabase client, imports them) —
 * guarding that whole file would have broken it the moment anything actually
 * used it. This file exists so a future import of `readServerEnv` from a
 * client component fails at build time on its own, rather than depending on
 * every caller (today, only lib/supabase/admin.ts) to add its own guard.
 */

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

export function readServerEnv() {
  const result = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!result.success) {
    throw new Error("Invalid server environment variables");
  }

  return result.data;
}
