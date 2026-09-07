import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";
import type { OrderStatus } from "@/types/order";

/**
 * The customer's own view of one order.
 *
 * Read with the service-role client, because `orders` has no public read policy
 * and must never get one — one would expose every buyer's order to anyone
 * holding the anon key, which is a public value (ARCHITECTURE.md §16.1). The
 * capability token in the URL is the authorization, and this module is the
 * trust boundary that checks it, exactly as `captureOrderAction` is for writes.
 *
 * What is deliberately NOT returned: the customer's name, phone, city, the
 * internal order id, the admin note, or anything about any other order. The
 * page needs the order's own contents and its status, nothing more — and
 * whoever holds the link may not be the person who placed it (a forwarded
 * WhatsApp message, a shared device), so the less identity in here the better.
 */
export type CustomerOrderView = {
  orderNumber: string;
  status: OrderStatus;
  placedAt: string;
  giftWrap: boolean;
  /** Exactly the label the cart showed: "Free", "₹79", "Confirmed on WhatsApp". */
  deliveryLabel: string | null;
  subtotal: number;
  total: number;
  /** True when delivery was never quoted, so `total` excludes it. */
  totalProvisional: boolean;
  items: {
    name: string;
    sku: string | null;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }[];
};

type OrderRow = {
  order_number: string;
  status: OrderStatus;
  created_at: string;
  gift_wrap: boolean;
  delivery_charge: number | string | null;
  delivery_label: string | null;
  subtotal: number | string;
  total: number | string;
  order_items:
    | {
        name: string;
        sku: string | null;
        qty: number;
        unit_price: number | string;
        line_total: number | string;
      }[]
    | null;
};

/** A `public_token` is a UUID; anything else never reaches the database. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Finds one order by its tracking token.
 *
 * Returns null for an unknown, malformed or missing token — the caller renders
 * a plain 404 either way. It deliberately does not distinguish "never existed"
 * from "the customer was erased under DPDP, so `customer_id` is null": both are
 * simply not found, and saying which would confirm a record once existed.
 */
export async function getOrderByPublicToken(
  token: string,
): Promise<CustomerOrderView | null> {
  if (!isSupabaseConfigured) return null;
  if (!UUID_PATTERN.test(token)) return null;

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    logger.error("getOrderByPublicToken cannot read: service-role key missing");
    return null;
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      `order_number, status, created_at, gift_wrap, delivery_charge, delivery_label,
       subtotal, total,
       order_items(name, sku, qty, unit_price, line_total)`,
    )
    .eq("public_token", token)
    .maybeSingle();

  if (error) {
    // Never echo the token into a log — it is the credential.
    logger.error("getOrderByPublicToken failed", { error: error.message });
    return null;
  }

  if (!data) return null;

  const row = data as unknown as OrderRow;

  return {
    orderNumber: row.order_number,
    status: row.status,
    placedAt: row.created_at,
    giftWrap: row.gift_wrap,
    deliveryLabel: row.delivery_label,
    subtotal: Number(row.subtotal),
    total: Number(row.total),
    totalProvisional: row.delivery_charge === null,
    items: (row.order_items ?? []).map((item) => ({
      name: item.name,
      sku: item.sku,
      qty: item.qty,
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    })),
  };
}
