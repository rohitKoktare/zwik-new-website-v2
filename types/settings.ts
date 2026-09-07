export type SiteSettings = {
  whatsappNumber: string | null;
  whatsappDefaultMessage: string | null;
  whatsappEnabled: boolean;
  amazonStoreUrl: string | null;
  instagramUrl: string | null;
  contactEmail: string | null;
  brandName: string;
  defaultSeoTitle: string | null;
  defaultSeoDescription: string | null;
  /**
   * Cart subtotal at or above which delivery is free. Null means no offer is
   * running, and the storefront then says nothing about delivery cost rather
   * than advertising a ₹0 threshold.
   */
  freeDeliveryThreshold: number | null;
  /** Where the offer applies, e.g. "across all India". */
  deliveryScopeNote: string | null;
  /**
   * Flat delivery charge below the threshold. Null means the site does not
   * quote a charge at all and the cart says so, rather than guessing.
   */
  deliveryFee: number | null;
};
