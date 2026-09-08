import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, publicEnv } from "@/lib/validation/env";

/**
 * Server Component / Server Action / Route Handler Supabase client.
 * Reads/writes the session via Next.js cookies. Uses the anon key — RLS
 * still applies. For privileged operations use lib/supabase/admin.ts instead.
 */
export async function createClient() {
  if (!isSupabaseConfigured || !publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    // @supabase/ssr's own default is `httpOnly: false` with no `secure` key
    // (see node_modules/@supabase/ssr/dist/main/utils/constants.js) — fine
    // for a client-side Supabase instance, wrong for a server-issued session
    // cookie carrying admin access. Without this, the session token is
    // readable by any same-origin script (XSS, a compromised third-party
    // script) and can be sent over plain HTTP. Mirrors the flags
    // lib/customer-auth/session.ts already sets on its own cookie.
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component render — safe to ignore because
          // middleware refreshes the session cookie on the next request.
        }
      },
    },
  });
}
