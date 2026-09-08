import "server-only";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/customer-auth/session";
import type { Customer } from "@/types/customer";

/** Mirrors lib/auth/guard.ts's LOGIN_PATH, for the same reason. */
export const CUSTOMER_LOGIN_PATH = "/orders/login";

/**
 * Server-side gate for the customer order-history page.
 *
 * Call this from the page itself (there is only one protected customer page
 * today, so a `(protected)` layout the way `app/admin/(protected)/layout.tsx`
 * centralizes `requireAdmin()` would be premature — promote to one if a
 * second protected customer page shows up).
 */
export async function requireCustomer(): Promise<Customer> {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect(CUSTOMER_LOGIN_PATH);
  }

  return customer;
}
