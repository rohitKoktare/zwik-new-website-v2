export const ORDER_STATUSES = ["initiated", "confirmed", "cancelled", "fulfilled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  // Deliberately not called "New" or "Placed": the site cannot observe whether
  // the customer actually sent the WhatsApp message it composed for them.
  initiated: "Started on site",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  fulfilled: "Fulfilled",
};

export const ORDER_STATUS_HINTS: Record<OrderStatus, string> = {
  initiated:
    "Composed on the site and handed to WhatsApp. We cannot tell whether the customer pressed send — treat it as an enquiry until you have their message.",
  confirmed: "You have spoken to the customer and agreed the order.",
  cancelled: "Not going ahead.",
  fulfilled: "Paid and shipped.",
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
