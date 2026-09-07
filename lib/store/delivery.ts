import { formatInr } from "@/lib/format";
import type { SiteSettings } from "@/types/settings";

/**
 * Delivery terms and quoting, derived in one place.
 *
 * ZWIK confirms the final total on WhatsApp (ARCHITECTURE.md §18), so nothing
 * here may read as a binding quote beyond what the admin has actually
 * configured. Two consequences shape the design:
 *
 *   - With no threshold set, the offer is simply not running and every surface
 *     renders nothing rather than inventing a default.
 *   - With no fee set, the cart says delivery is confirmed on WhatsApp instead
 *     of guessing a number. Previously the cart hard-coded ₹79 and put it in
 *     the order message — a charge nobody could change without a deploy.
 */

export type DeliveryTerms = {
  /** Whether a free-delivery offer is configured. */
  offerRunning: boolean;
  /** The threshold, e.g. 500. Null when no offer is running. */
  threshold: number | null;
  /** e.g. "₹500". Null when no offer is running. */
  thresholdLabel: string | null;
  /** e.g. "across all India", already trimmed. Null when unset. */
  scopeNote: string | null;
  /** Flat charge below the threshold. Null = quoted on WhatsApp. */
  fee: number | null;
  /** e.g. "Free delivery over ₹500 across all India". Null when no offer. */
  headline: string | null;
};

export function getDeliveryTerms(settings: SiteSettings): DeliveryTerms {
  const threshold = settings.freeDeliveryThreshold;
  const scopeNote = settings.deliveryScopeNote?.trim() || null;

  const fee =
    settings.deliveryFee !== null && Number.isFinite(settings.deliveryFee)
      ? settings.deliveryFee
      : null;

  // A zero or negative threshold is treated as "no offer" rather than "free on
  // everything" — validation blocks it, but a hand-edited row could hold it.
  if (threshold === null || !Number.isFinite(threshold) || threshold <= 0) {
    return {
      offerRunning: false,
      threshold: null,
      thresholdLabel: null,
      scopeNote,
      fee,
      headline: null,
    };
  }

  const thresholdLabel = formatInr(threshold);

  return {
    offerRunning: true,
    threshold,
    thresholdLabel,
    scopeNote,
    fee,
    headline: scopeNote
      ? `Free delivery over ${thresholdLabel} ${scopeNote}`
      : `Free delivery over ${thresholdLabel}`,
  };
}

export type DeliveryProgress = {
  /** True once the subtotal reaches the threshold. */
  qualified: boolean;
  /** Amount still needed, or 0 when qualified. */
  remaining: number;
  /** 0–1, for a progress bar. */
  fraction: number;
  /** Sentence for the cart, e.g. "Add ₹120 more for free delivery". */
  message: string;
};

/**
 * How far a cart subtotal is from qualifying.
 *
 * Returns null when no offer is running, so callers render nothing rather than
 * an empty progress bar.
 */
export function getDeliveryProgress(
  terms: DeliveryTerms,
  subtotal: number,
): DeliveryProgress | null {
  if (!terms.offerRunning || terms.threshold === null) return null;

  const qualified = subtotal >= terms.threshold;
  const remaining = qualified ? 0 : terms.threshold - subtotal;

  return {
    qualified,
    remaining,
    // Clamped so a large cart cannot overfill the bar.
    fraction: Math.max(0, Math.min(1, subtotal / terms.threshold)),
    message: qualified
      ? terms.scopeNote
        ? `Delivery is free on this order ${terms.scopeNote}.`
        : "Delivery is free on this order."
      : `Add ${formatInr(remaining)} more for free delivery.`,
  };
}

export type DeliveryQuote = {
  /** Charge to add, or null when the site cannot state one. */
  charge: number | null;
  /** What to show on the Delivery row: "Free", "₹79", "Confirmed on WhatsApp". */
  label: string;
  /** Subtotal plus charge. Equals the subtotal when the charge is unknown. */
  total: number;
  /**
   * True when `total` excludes an unknown delivery charge. The UI must label
   * the total accordingly rather than presenting a figure ZWIK has not quoted.
   */
  totalProvisional: boolean;
};

/**
 * The delivery line for a given cart subtotal.
 *
 * Order of precedence, and why:
 *   1. Empty cart      — nothing to deliver, so no charge and no claim.
 *   2. Offer qualified — free, which the site may state because the admin set
 *                        the threshold that makes it true.
 *   3. Fee configured  — the admin's number, quoted as-is.
 *   4. Otherwise       — unknown. Say so; never guess a shipping charge.
 */
export function getDeliveryQuote(terms: DeliveryTerms, subtotal: number): DeliveryQuote {
  if (subtotal <= 0) {
    return { charge: 0, label: "—", total: 0, totalProvisional: false };
  }

  if (terms.offerRunning && terms.threshold !== null && subtotal >= terms.threshold) {
    return { charge: 0, label: "Free", total: subtotal, totalProvisional: false };
  }

  if (terms.fee !== null) {
    return {
      charge: terms.fee,
      label: terms.fee === 0 ? "Free" : formatInr(terms.fee),
      total: subtotal + terms.fee,
      totalProvisional: false,
    };
  }

  return {
    charge: null,
    label: "Confirmed on WhatsApp",
    total: subtotal,
    totalProvisional: true,
  };
}
