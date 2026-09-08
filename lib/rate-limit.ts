import "server-only";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";

/**
 * Sliding-window throttle shared by every unauthenticated attempt-style
 * action (customer phone sign-in, admin sign-in, ...). Built for customer
 * sign-in first (migrations 0015/0016's `login_attempts` table and
 * `record_login_attempt()` RPC); generalized here once admin sign-in needed
 * the identical protection rather than a second copy of it.
 *
 * `bucket` namespaces the counter per feature, hashed together with the
 * caller's IP, so hammering one action doesn't throttle a different one for
 * someone sharing an IP (an office network, a VPN exit node, campus Wi-Fi).
 */
export async function checkRateLimit(
  bucket: string,
  opts: { maxAttempts: number; windowMinutes: number },
): Promise<boolean> {
  if (!isSupabaseConfigured) return true;

  const headerList = await headers();
  // Vercel (and most proxies) set this; the first entry is the original
  // client. No pepper needed on the hash itself — this is a rate-limit bucket
  // key, not a security token, and the row is meaningless once its window
  // lapses — but the bucket namespace IS mixed in before hashing, not
  // appended after, so one feature's key space can't collide with another's.
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = createHash("sha256").update(`${bucket}:${ip}`).digest("hex");

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("record_login_attempt", {
    p_ip_hash: ipHash,
    p_window: `${opts.windowMinutes} minutes`,
  });

  if (error) {
    // Fail open: a broken rate limiter must not lock everyone out of a
    // legitimate sign-in or checkout. Logged so it gets noticed and fixed.
    logger.error("checkRateLimit failed", { bucket, error: error.message });
    return true;
  }

  return (data as number) <= opts.maxAttempts;
}
