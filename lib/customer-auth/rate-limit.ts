import "server-only";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Sliding-window throttle for phone sign-in.
 *
 * Nothing verifies phone ownership yet (see `otp-provider.ts`), so this is
 * the one thing standing between "type a number, see its orders" and someone
 * scripting through the phone-number space. It bounds bulk scanning; it
 * cannot stop a targeted lookup of one already-known number, which is the
 * accepted trade-off documented in docs/DATABASE_DESIGN.md.
 */

/** Returns true if the caller is still within the allowed rate. */
export async function checkLoginRateLimit(): Promise<boolean> {
  return checkRateLimit("customer-login", { maxAttempts: 20, windowMinutes: 10 });
}
