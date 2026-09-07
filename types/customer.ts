export type Customer = {
  id: string;
  /** Digits only, including country code. The customer's identity. */
  phone: string;
  name: string | null;
  cityAndPincode: string | null;
  /** Explicit opt-in. Never inferred from having placed an order. */
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  marketingConsentSource: string | null;
  /** Set on opt-out. Overrides `marketingConsent` for every send. */
  unsubscribedAt: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Whether this customer may receive a marketing message.
 *
 * The single place this is decided. Consent and unsubscription are separate
 * fields precisely so a later re-tick of the cart checkbox cannot resurrect a
 * withdrawn consent — an unsubscribe always wins.
 */
export function canReceiveMarketing(
  customer: Pick<Customer, "marketingConsent" | "unsubscribedAt">,
): boolean {
  return customer.marketingConsent && customer.unsubscribedAt === null;
}
