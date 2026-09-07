import type { CartLine } from "@/types/cart";
import type { DeliveryQuote } from "@/lib/store/delivery";
import { formatInr } from "@/lib/format";

function normalizePhone(whatsappNumber: string): string {
  return whatsappNumber.replace(/[^0-9]/g, "");
}

/** Builds a wa.me deep link. `whatsappNumber` should include the country code (e.g. "917666068317"). */
export function buildWaLink(whatsappNumber: string, message: string): string {
  return `https://wa.me/${normalizePhone(whatsappNumber)}?text=${encodeURIComponent(message)}`;
}

export type OrderDetails = {
  lines: CartLine[];
  giftWrap: boolean;
  customer: {
    name: string;
    phone: string;
    cityAndPincode: string;
    note: string;
  };
  /**
   * The already-resolved delivery line. Passed in rather than recomputed here
   * so the message can never disagree with what the cart showed the customer —
   * this module used to take a threshold and fee and derive its own figure.
   */
  delivery: DeliveryQuote;
};

/** Builds the itemized order message sent over WhatsApp. No payment is collected on the site. */
export function buildOrderMessage({
  lines,
  giftWrap,
  customer,
  delivery,
}: OrderDetails): string {
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);

  return [
    "New ZWIK order",
    "",
    ...lines.map(
      (line, i) =>
        `${i + 1}. ${line.name} (${line.sku}) x${line.qty} — ${formatInr(line.price * line.qty)}`,
    ),
    "",
    `Items: ${formatInr(subtotal)}`,
    `Delivery: ${delivery.label}`,
    // Never present a total as final when the delivery charge is unknown.
    delivery.totalProvisional
      ? `Total so far: ${formatInr(delivery.total)} (before delivery)`
      : `Total: ${formatInr(delivery.total)}`,
    `Gift wrap: ${giftWrap ? "Yes" : "No"}`,
    "",
    `Name: ${customer.name || "—"}`,
    `Phone: ${customer.phone || "—"}`,
    `City & pincode: ${customer.cityAndPincode || "—"}`,
    `Note: ${customer.note || "—"}`,
    "",
    "Please confirm availability and share payment details.",
  ].join("\n");
}
