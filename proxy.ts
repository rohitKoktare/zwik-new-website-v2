import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, publicEnv } from "@/lib/validation/env";

/**
 * Refreshes the Supabase auth session cookie on every request, per the
 * official @supabase/ssr Next.js pattern. Required for /admin session checks
 * (lib/auth/guard.ts) to see a valid, non-expired session.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  if (!isSupabaseConfigured || !publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    // Must match lib/supabase/server.ts's cookieOptions exactly — this proxy
    // reissues the same session cookie on every /admin request, and a
    // mismatch would silently drop httpOnly/secure back to @supabase/ssr's
    // insecure defaults on refresh even after server.ts sets them correctly
    // on sign-in.
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
