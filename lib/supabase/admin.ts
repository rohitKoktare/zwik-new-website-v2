import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/validation/env";
import { readServerEnv } from "@/lib/validation/server-env";

/**
 * Service-role Supabase client for privileged, server-only operations
 * (e.g. admin writes that must bypass RLS deliberately). The `server-only`
 * import above makes bundling this into a client component a build error.
 *
 * Do not use this for ordinary reads/writes — use lib/supabase/server.ts
 * so RLS policies are enforced.
 */
export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = readServerEnv();

  if (!publicEnv.supabaseUrl || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseClient(publicEnv.supabaseUrl, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
