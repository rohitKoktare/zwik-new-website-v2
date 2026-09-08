import "server-only";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";

/**
 * Sliding-window throttle for phone sign-in.
 *
 * Nothing verifies phone ownership yet (see `otp-provider.ts`), so this is
 * the one thing standing between "type a number, see its orders" and someone
 * scripting through the phone-number space. It bounds bulk scanning; it
 * cannot stop a targeted lookup of one already-known number, which is the
 * accepted trade-off documented in docs/DATABASE_DESIGN.md.
 */

const WINDOW = "10 minutes";
const MAX_ATTEMPTS_PER_WINDOW = 20;

async function clientIpHash(): Promise<string> {
  const headerList = await headers();
  // Vercel (and most proxies) set this; the first entry is the original
  // client. No pepper needed — this is a rate-limit bucket key, not a
  // security token, and the row is meaningless once its window lapses.
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(ip).digest("hex");
}

/** Returns true if the caller is still within the allowed rate. */
export async function checkLoginRateLimit(): Promise<boolean> {
  if (!isSupabaseConfigured) return true;

  const ipHash = await clientIpHash();
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("record_login_attempt", {
    p_ip_hash: ipHash,
    p_window: WINDOW,
  });

  if (error) {
    // Fail open: a broken rate limiter must not lock every customer out of
    // their own order history. Logged so it gets noticed and fixed.
    logger.error("checkLoginRateLimit failed", { error: error.message });
    return true;
  }

  return (data as number) <= MAX_ATTEMPTS_PER_WINDOW;
}
