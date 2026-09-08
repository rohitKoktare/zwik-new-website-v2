import "server-only";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";
import type { Customer } from "@/types/customer";

/**
 * Phone sign-in session, kept entirely separate from Supabase Auth (which
 * this app uses only for the admin area). The cookie holds an opaque random
 * token; only its hash is ever stored, in `customer_sessions`
 * (migration 0015) — the same trust-boundary shape as `orders.public_token`:
 * the token is the authorization, and this module (via the service-role
 * client) is the trust boundary that checks it.
 */

const COOKIE_NAME = "zwik_customer_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type SessionCustomerRow = {
  id: string;
  phone: string;
  name: string | null;
  city_and_pincode: string | null;
  marketing_consent: boolean;
  marketing_consent_at: string | null;
  marketing_consent_source: string | null;
  unsubscribed_at: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

/** PostgREST embeds a to-one relation as an object or a single-item array. */
function firstOrNull<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toCustomer(row: SessionCustomerRow): Customer {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    cityAndPincode: row.city_and_pincode,
    marketingConsent: row.marketing_consent,
    marketingConsentAt: row.marketing_consent_at,
    marketingConsentSource: row.marketing_consent_source,
    unsubscribedAt: row.unsubscribed_at,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Issues a new session for a customer and sets the cookie.
 *
 * Called only after `lib/customer-auth/actions.ts` has already established
 * the caller controls this phone number — directly, for now (real
 * verification is deferred; see `otp-provider.ts`), or via a checked OTP once
 * one is configured.
 */
export async function createCustomerSession(customerId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const supabase = createAdminClient();
  const { error } = await supabase.from("customer_sessions").insert({
    customer_id: customerId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    logger.error("createCustomerSession failed", { error: error.message });
    throw new Error("Couldn't sign you in. Please try again.");
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Returns the signed-in customer, or null if there is no session, it has
 * expired, or Supabase isn't configured.
 *
 * The cookie is never logged — like `public_token`, it is the credential.
 */
export async function getCurrentCustomer(): Promise<Customer | null> {
  if (!isSupabaseConfigured) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("customer_sessions")
    .select(
      `expires_at,
       customer:customers(id, phone, name, city_and_pincode, marketing_consent,
         marketing_consent_at, marketing_consent_source, unsubscribed_at,
         admin_note, created_at, updated_at)`,
    )
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error) {
    logger.error("getCurrentCustomer lookup failed", { error: error.message });
    return null;
  }

  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;

  type Row = { customer: SessionCustomerRow | SessionCustomerRow[] | null };
  const customerRow = firstOrNull((data as unknown as Row).customer);
  if (!customerRow) return null;

  return toCustomer(customerRow);
}

/**
 * Ends the current session: deletes the `customer_sessions` row (not just
 * the cookie), so a copied or previously-synced cookie value stops working
 * too, and clears the cookie itself.
 */
export async function destroyCustomerSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token && isSupabaseConfigured) {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("customer_sessions")
      .delete()
      .eq("token_hash", hashToken(token));

    if (error) {
      logger.error("destroyCustomerSession delete failed", { error: error.message });
    }
  }

  cookieStore.delete(COOKIE_NAME);
}
