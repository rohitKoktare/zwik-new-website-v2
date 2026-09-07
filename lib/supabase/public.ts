import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv } from "@/lib/validation/env";

/**
 * Cookie-less Supabase client for public storefront reads.
 *
 * Why this exists separately from lib/supabase/server.ts: that client reads
 * cookies to carry the user's session, and touching cookies opts a route out of
 * static rendering entirely. Every storefront page would then be rendered per
 * request, which defeats the caching ARCHITECTURE.md §15 asks for.
 *
 * Public pages have no session to respect — they show the same active products
 * and settings to everyone — so reading them without cookies is both faster and
 * more correct: a cached public page can never accidentally embed one visitor's
 * session-scoped data.
 *
 * Still subject to RLS via the anon key, so it can only ever see rows the
 * public-read policies expose.
 *
 * Use lib/supabase/server.ts instead for anything that must know who is asking.
 */
export function createPublicClient() {
  if (!isSupabaseConfigured || !publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }

  return createSupabaseClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
