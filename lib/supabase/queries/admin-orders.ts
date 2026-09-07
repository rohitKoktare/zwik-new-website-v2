import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logQueryFailure } from "@/lib/supabase/pending-migration";
import type { Pagination } from "@/lib/admin/pagination";
import { ORDER_STATUSES, type Order, type OrderStatus } from "@/types/order";

/**
 * Admin order reads.
 *
 * These rows contain personal data via the joined customer, so every query here
 * goes through the RLS-enforced client (`lib/supabase/server.ts`) rather than
 * the service-role one. The `customers`/`orders` policies from migration 0012
 * are admin-only, so a non-admin session sees nothing even if it reaches this
 * code — the RLS check is not delegated to the page's `requireAdmin()`.
 *
 * Generated database types do not exist yet, so row shapes are declared
 * explicitly (DEVELOPMENT_STANDARDS.md §4).
 */

export type AdminOrder = Order & {
  /** Null when the order was placed with no phone, or the customer was erased. */
  customerName: string | null;
  customerPhone: string | null;
  itemCount: number;
  /**
   * How many OTHER orders from this customer are already confirmed or
   * fulfilled — this order itself is never counted.
   *
   * Confirmed/fulfilled only, deliberately: an `initiated` order is one the
   * customer placed but nobody has agreed yet, so counting those would badge a
   * first real purchase as a repeat.
   */
  priorConfirmedOrders: number;
  /** Convenience for the badge; `priorConfirmedOrders > 0`. */
  repeatCustomer: boolean;
};

/** Validates an untrusted `?status=` value (DEVELOPMENT_STANDARDS.md §7). */
export function parseOrderStatusFilter(value?: string): OrderStatus | undefined {
  const allowed: readonly string[] = ORDER_STATUSES;
  return value !== undefined && allowed.includes(value) ? (value as OrderStatus) : undefined;
}

type JoinedCustomer = { id: string; name: string | null; phone: string };

type OrderItemRow = {
  id: string;
  product_id: string | null;
  sku: string | null;
  name: string;
  unit_price: number | string;
  qty: number;
  line_total: number | string;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_id: string | null;
  status: OrderStatus;
  subtotal: number | string;
  delivery_charge: number | string | null;
  delivery_label: string | null;
  total: number | string;
  currency: string;
  gift_wrap: boolean;
  customer_note: string | null;
  source: string;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  customer: JoinedCustomer | JoinedCustomer[] | null;
  order_items: OrderItemRow[] | null;
};

// `public_token` is deliberately absent: it is a capability token, and the
// admin has no need of it (see types/order.ts).
const ORDER_SELECT = `
  id, order_number, customer_id, status, subtotal, delivery_charge, delivery_label, total, currency,
  gift_wrap, customer_note, source, created_at, confirmed_at, cancelled_at,
  customer:customers(id, name, phone),
  order_items(id, product_id, sku, name, unit_price, qty, line_total)
`;

/** PostgREST embeds a to-one relation as an object or a single-item array. */
function firstOrNull<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toAdminOrder(row: OrderRow, priorConfirmedOrders = 0): AdminOrder {
  const customer = firstOrNull(row.customer);

  const items = (row.order_items ?? []).map((item) => ({
    id: item.id,
    productId: item.product_id,
    sku: item.sku,
    name: item.name,
    unitPrice: Number(item.unit_price),
    qty: item.qty,
    lineTotal: Number(item.line_total),
  }));

  return {
    id: row.id,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    status: row.status,
    subtotal: Number(row.subtotal),
    deliveryCharge: row.delivery_charge === null ? null : Number(row.delivery_charge),
    deliveryLabel: row.delivery_label,
    total: Number(row.total),
    currency: row.currency,
    giftWrap: row.gift_wrap,
    customerNote: row.customer_note,
    source: row.source,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    cancelledAt: row.cancelled_at,
    items,
    customerName: customer?.name ?? null,
    customerPhone: customer?.phone ?? null,
    itemCount: items.reduce((sum, item) => sum + item.qty, 0),
    priorConfirmedOrders,
    repeatCustomer: priorConfirmedOrders > 0,
  };
}

/** Statuses that count as a real prior purchase for the repeat badge. */
const SETTLED_STATUSES: readonly OrderStatus[] = ["confirmed", "fulfilled"];

/**
 * Counts each customer's settled orders, excluding the orders being displayed.
 *
 * One extra bounded query rather than a nested `customers(orders(...))` embed:
 * that would be a self-referential PostgREST embed (orders → customers →
 * orders), which is both harder to reason about and less predictable than
 * fetching the ids we need and tallying them here.
 *
 * Returns a map of customer id → count of their settled orders that are NOT in
 * `excludeOrderIds`, so an order never counts itself toward being a repeat.
 */
async function countPriorSettledOrders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerIds: string[],
  excludeOrderIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (customerIds.length === 0) return counts;

  const { data, error } = await supabase
    .from("orders")
    .select("id, customer_id")
    .in("customer_id", customerIds)
    .in("status", SETTLED_STATUSES);

  if (error) {
    // A missing badge is cosmetic; the order list itself must still render.
    logQueryFailure("countPriorSettledOrders", error, "orders");
    return counts;
  }

  const excluded = new Set(excludeOrderIds);

  for (const row of (data ?? []) as { id: string; customer_id: string | null }[]) {
    if (!row.customer_id || excluded.has(row.id)) continue;
    counts.set(row.customer_id, (counts.get(row.customer_id) ?? 0) + 1);
  }

  return counts;
}

/**
 * Paginated admin list, newest first. Bounded by `.range()` like every admin
 * list (DATABASE_DESIGN.md §19).
 */
export async function listOrdersForAdmin(options: {
  pagination: Pagination;
  status?: OrderStatus;
  customerId?: string;
  search?: string;
}): Promise<{ orders: AdminOrder[]; totalCount: number }> {
  if (!isSupabaseConfigured) return { orders: [], totalCount: 0 };

  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select(ORDER_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(options.pagination.from, options.pagination.to);

  if (options.status) query = query.eq("status", options.status);
  if (options.customerId) query = query.eq("customer_id", options.customerId);

  if (options.search) {
    /*
     * Two handles a customer can quote, told apart by shape rather than by
     * making the admin pick from a dropdown:
     *
     *   - anything starting "ZW" is an order number (ZW-2609-0042)
     *   - anything else is reduced to digits and matched against the phone
     *
     * Name search is still deliberately absent: it would need an
     * embedded-resource filter, and a phone or an order number is what ZWIK
     * actually has to hand from a WhatsApp thread.
     */
    const raw = options.search.trim();

    if (/^zw/i.test(raw)) {
      // Strip PostgREST's pattern and delimiter characters before interpolating.
      const safe = raw.replace(/[%_,()]/g, "");
      if (safe) query = query.ilike("order_number", `%${safe}%`);
    } else {
      const digits = raw.replace(/[^0-9]/g, "");
      if (digits) query = query.eq("customer.phone", digits);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    logQueryFailure("listOrdersForAdmin", error, "orders");
    return { orders: [], totalCount: 0 };
  }

  const rows = (data ?? []) as unknown as OrderRow[];

  // Second query, bounded to the customers on this page only.
  const priorCounts = await countPriorSettledOrders(
    supabase,
    [...new Set(rows.map((row) => row.customer_id).filter((id): id is string => id !== null))],
    rows.map((row) => row.id),
  );

  return {
    orders: rows.map((row) =>
      toAdminOrder(row, row.customer_id ? (priorCounts.get(row.customer_id) ?? 0) : 0),
    ),
    totalCount: count ?? 0,
  };
}

export async function getOrderById(id: string): Promise<AdminOrder | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logQueryFailure("getOrderById", error, "orders");
    return null;
  }

  if (!data) return null;

  const row = data as unknown as OrderRow;

  const priorCounts = row.customer_id
    ? await countPriorSettledOrders(supabase, [row.customer_id], [row.id])
    : null;

  return toAdminOrder(
    row,
    row.customer_id ? (priorCounts?.get(row.customer_id) ?? 0) : 0,
  );
}

/** Counts per status, for the dashboard and the list's filter chips. */
export async function countOrdersByStatus(): Promise<Record<OrderStatus, number>> {
  const empty: Record<OrderStatus, number> = {
    initiated: 0,
    confirmed: 0,
    cancelled: 0,
    fulfilled: 0,
  };

  if (!isSupabaseConfigured) return empty;

  const supabase = await createClient();

  // One HEAD count per status. Four cheap index-only queries beat fetching
  // every row to tally client-side.
  const results = await Promise.all(
    ORDER_STATUSES.map(async (status) => {
      const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", status);

      if (error) {
        logQueryFailure("countOrdersByStatus", error, "orders");
        return [status, 0] as const;
      }

      return [status, count ?? 0] as const;
    }),
  );

  return { ...empty, ...Object.fromEntries(results) };
}
