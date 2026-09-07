export const ORDER_STATUSES = ["initiated", "confirmed", "cancelled", "fulfilled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Admin-facing labels.
 *
 * `initiated` used to read "Started on site", because the order was only
 * composed here and handed to WhatsApp — the site could not tell whether the
 * customer ever pressed send. Placing an order is now an on-site action that
 * always records a row, so `initiated` means placed but not yet agreed.
 * See ARCHITECTURE.md §5.1.
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  initiated: "Placed, unconfirmed",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  fulfilled: "Fulfilled",
};

export const ORDER_STATUS_HINTS: Record<OrderStatus, string> = {
  initiated:
    "Placed on the site. The customer has not necessarily messaged you yet — confirm stock and the total with them before treating it as agreed.",
  confirmed: "You have spoken to the customer and agreed the order.",
  cancelled: "Not going ahead.",
  fulfilled: "Paid and shipped.",
};

/**
 * Customer-facing labels, deliberately a separate map.
 *
 * The admin hints above are written in admin voice ("You have spoken to the
 * customer") and must never reach the tracking page. These also avoid implying
 * the order is reserved or paid, which ARCHITECTURE.md §18 forbids — ZWIK
 * confirms stock, total and payment on WhatsApp, not here.
 */
export const ORDER_STATUS_CUSTOMER_LABELS: Record<OrderStatus, string> = {
  initiated: "Received",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  fulfilled: "Shipped",
};

export const ORDER_STATUS_CUSTOMER_HINTS: Record<OrderStatus, string> = {
  initiated:
    "We have your order and will confirm availability and the final total with you on WhatsApp.",
  confirmed: "Confirmed with you. We'll let you know once it ships.",
  cancelled: "This order is not going ahead. Message us if that's a surprise.",
  fulfilled: "On its way.",
};

export type OrderItem = {
  id: string;
  /** Null once the product has been deleted; the snapshot below still reads. */
  productId: string | null;
  sku: string | null;
  name: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
};

export type Order = {
  id: string;
  /** Human handle, ZW-YYMM-NNNN. Shown to the customer; not a secret. */
  orderNumber: string;
  /**
   * `public_token` is deliberately NOT on this shared type. It is a capability
   * token — on its own it grants read access to one order — so it lives only on
   * the customer-facing shape in lib/store/orders/lookup.ts, and admin queries
   * never select it by accident.
   */
  /** Null once the customer has been erased. The sales record survives. */
  customerId: string | null;
  status: OrderStatus;
  subtotal: number;
  /** Null when the site did not quote a delivery charge. Never treat as 0. */
  deliveryCharge: number | null;
  /** Exactly what the customer saw: "Free", "₹79", "Confirmed on WhatsApp". */
  deliveryLabel: string | null;
  total: number;
  currency: string;
  giftWrap: boolean;
  customerNote: string | null;
  source: string;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  items: OrderItem[];
};
