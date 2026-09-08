import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { OrderStatus } from "@/types/order";

/**
 * A signed-in customer's own order list.
 *
 * Selects `public_token` — the mirror image of `admin-orders.ts`'s
 * `ORDER_SELECT`, which deliberately excludes it because a capability token
 * has no business being in an admin listing. It's fine here specifically
 * because this read is already scoped to the resolved session's own
 * `customer_id` (lib/customer-auth/session.ts) before this function is ever
 * called — not because customer-facing queries get to see more in general —
 * and the token is what lets each row link into the existing
 * `/orders/[token]` detail page without duplicating its rendering.
 *
 * Uses the service-role client because this isn't an RLS-authenticated read:
 * the phone-sign-in session is a bespoke cookie, not a Postgres role, so RLS
 * has nothing to key off. This function is the trust boundary, the same role
 * `lib/store/orders/lookup.ts` already plays for the single-order page.
 */
export type CustomerOrderSummary = {
  orderNumber: string;
  publicToken: string;
  status: OrderStatus;
  placedAt: string;
  total: number;
  /** True when delivery was never quoted, so `total` excludes it. */
  totalProvisional: boolean;
};

type OrderRow = {
  order_number: string;
  public_token: string;
  status: OrderStatus;
  created_at: string;
  total: number | string;
  delivery_charge: number | string | null;
};

export async function getOrdersForCustomer(customerId: string): Promise<CustomerOrderSummary[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("orders")
    .select("order_number, public_token, status, created_at, total, delivery_charge")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("getOrdersForCustomer failed", { error: error.message });
    return [];
  }

  return ((data ?? []) as unknown as OrderRow[]).map((row) => ({
    orderNumber: row.order_number,
    publicToken: row.public_token,
    status: row.status,
    placedAt: row.created_at,
    total: Number(row.total),
    totalProvisional: row.delivery_charge === null,
  }));
}
