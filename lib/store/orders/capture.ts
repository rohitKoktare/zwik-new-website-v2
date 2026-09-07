"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { getSiteSettings } from "@/lib/supabase/queries/settings";
import { getDeliveryQuote, getDeliveryTerms } from "@/lib/store/delivery";
import { orderCaptureSchema, type OrderCaptureInput } from "@/lib/validation/order";
import { logger } from "@/lib/logger";

/**
 * Records an order at WhatsApp hand-off.
 *
 * This is the only write path reachable by an anonymous visitor, so it is the
 * one place in the codebase where none of the input can be trusted. Four rules
 * follow from that, and each is load-bearing:
 *
 * 1. **Money is never taken from the client.** The posted cart carries product
 *    ids and quantities only. Prices, the delivery charge and the totals are
 *    re-derived here from `products` and `site_settings`. Accepting a posted
 *    price would let anyone record an order claiming a ₹1 product — and since
 *    ZWIK reads these rows to fulfil, that is a real financial hole, not a
 *    cosmetic one.
 *
 * 2. **It writes with the service-role client.** `customers`, `orders` and
 *    `order_items` have no client-writable RLS policy at all (migration 0012),
 *    which is what stops the anon key from forging or enumerating orders. This
 *    server action is the trust boundary that replaces those policies.
 *
 * 3. **It must never block the hand-off.** Every failure path returns rather
 *    than throws, and the caller opens WhatsApp regardless. Losing a CRM row is
 *    a bad day; losing the customer's order because our bookkeeping failed is
 *    worse. The site's job is composing the order (ARCHITECTURE.md §1).
 *
 * 4. **Consent is never inferred.** Placing an order is consent to be contacted
 *    about that order. Marketing consent is a separate, explicit tick, and an
 *    earlier unsubscribe is never overwritten here.
 */

/** A repeat submission inside this window updates the same order. */
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

export type CaptureResult =
  | {
      ok: true;
      orderId: string;
      /** ZW-YYMM-NNNN. Shown to the customer and put in the WhatsApp message. */
      orderNumber: string;
      /** Capability token for the tracking URL. Treat as a secret. */
      publicToken: string;
      customerRecorded: boolean;
    }
  /**
   * `reason` is for logs, not for display.
   *
   * The cart no longer ignores this: it opens the confirmation dialog either
   * way, just without an order number, still offering the WhatsApp link and a
   * copy-the-summary fallback. A database problem must not cost the sale
   * (ARCHITECTURE.md §5.1).
   */
  | { ok: false; reason: string };

type ProductPriceRow = {
  id: string;
  sku: string | null;
  name: string;
  price: number | string;
  currency: string;
  is_active: boolean;
};

export async function captureOrderAction(input: OrderCaptureInput): Promise<CaptureResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: "supabase_not_configured" };

  // 1. Validate. The client is a browser we do not control.
  const parsed = orderCaptureSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn("captureOrderAction rejected invalid input", {
      issues: parsed.error.issues.map((i) => i.path.join(".")).join(","),
    });
    return { ok: false, reason: "invalid_input" };
  }
  const data = parsed.data;

  let supabase;
  try {
    // Throws when SUPABASE_SERVICE_ROLE_KEY is absent.
    supabase = createAdminClient();
  } catch {
    logger.error("captureOrderAction cannot write: service-role key missing");
    return { ok: false, reason: "no_service_role" };
  }

  // 2. Re-read the real prices. Only active products may be ordered; an
  //    archived one silently dropped here would understate the order, so a
  //    mismatch fails the capture instead.
  const ids = data.lines.map((line) => line.productId);
  const { data: productRows, error: productError } = await supabase
    .from("products")
    .select("id, sku, name, price, currency, is_active")
    .in("id", ids);

  if (productError) {
    logger.error("captureOrderAction product read failed", { error: productError.message });
    return { ok: false, reason: "product_read_failed" };
  }

  const products = new Map(
    ((productRows ?? []) as ProductPriceRow[])
      .filter((row) => row.is_active)
      .map((row) => [row.id, row]),
  );

  if (products.size !== ids.length) {
    logger.warn("captureOrderAction had unknown or inactive products", {
      requested: ids.length,
      resolved: products.size,
    });
    return { ok: false, reason: "unknown_product" };
  }

  const items = data.lines.map((line) => {
    const product = products.get(line.productId)!;
    const unitPrice = Number(product.price);
    return {
      product_id: product.id,
      sku: product.sku,
      name: product.name,
      unit_price: unitPrice,
      qty: line.qty,
      line_total: Number((unitPrice * line.qty).toFixed(2)),
    };
  });

  const subtotal = Number(items.reduce((sum, item) => sum + item.line_total, 0).toFixed(2));

  // Currencies are not mixed on one order; products are all INR today, and a
  // silent mix would produce a meaningless total.
  const currencies = new Set(items.map((_, i) => products.get(ids[i])!.currency));
  if (currencies.size > 1) {
    logger.error("captureOrderAction refused a mixed-currency cart", {
      currencies: [...currencies].join(","),
    });
    return { ok: false, reason: "mixed_currency" };
  }
  const currency = [...currencies][0] ?? "INR";

  // 3. Re-derive delivery from settings, for the same reason as prices.
  const settings = await getSiteSettings();
  const quote = getDeliveryQuote(getDeliveryTerms(settings), subtotal);

  // 4. Upsert the customer, when there is one to record.
  let customerId: string | null = null;

  if (data.phone) {
    customerId = await upsertCustomer(supabase, {
      phone: data.phone,
      name: data.name,
      cityAndPincode: data.cityAndPincode,
      marketingConsent: data.marketingConsent,
    });
  }

  // 5. Reuse a recent unconfirmed order from the same customer rather than
  //    stacking duplicates. Tapping "Send on WhatsApp", returning to the tab and
  //    tapping again is normal behaviour, not a second order.
  const existingId = customerId
    ? await findRecentInitiatedOrder(supabase, customerId)
    : null;

  const orderRow = {
    customer_id: customerId,
    status: "initiated",
    subtotal,
    delivery_charge: quote.charge,
    delivery_label: quote.label,
    total: quote.total,
    currency,
    gift_wrap: data.giftWrap,
    customer_note: data.note ?? null,
    source: "website_cart",
    updated_at: new Date().toISOString(),
  };

  let orderId: string;
  let orderNumber: string;
  let publicToken: string;

  if (existingId) {
    const { data: updated, error } = await supabase
      .from("orders")
      .update(orderRow)
      .eq("id", existingId)
      // Reusing a row keeps its original number, so the customer who taps twice
      // is shown the same one rather than appearing to have two orders.
      .select("id, order_number, public_token")
      .single();

    if (error || !updated) {
      logger.error("captureOrderAction order update failed", { error: error?.message });
      return { ok: false, reason: "order_write_failed" };
    }
    // Replace the lines wholesale; the cart may have changed between taps.
    const { error: clearError } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", existingId);
    if (clearError) {
      logger.error("captureOrderAction could not clear old items", {
        error: clearError.message,
      });
      return { ok: false, reason: "order_items_write_failed" };
    }
    const row = updated as { id: string; order_number: string; public_token: string };
    orderId = row.id;
    orderNumber = row.order_number;
    publicToken = row.public_token;
  } else {
    const { data: created, error } = await supabase
      .from("orders")
      .insert(orderRow)
      // order_number is filled by the orders_set_order_number trigger, so it
      // has to be read back rather than generated here (migration 0014).
      .select("id, order_number, public_token")
      .single();

    if (error || !created) {
      logger.error("captureOrderAction order insert failed", { error: error?.message });
      return { ok: false, reason: "order_write_failed" };
    }

    const row = created as { id: string; order_number: string; public_token: string };
    orderId = row.id;
    orderNumber = row.order_number;
    publicToken = row.public_token;
  }

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(items.map((item) => ({ ...item, order_id: orderId })));

  if (itemsError) {
    // The order header exists with no lines. Say so loudly: a headline-only
    // order is visibly wrong in the admin, which is better than a silent
    // partial write nobody notices.
    logger.error("captureOrderAction item insert failed", {
      orderId,
      error: itemsError.message,
    });
    return { ok: false, reason: "order_items_write_failed" };
  }

  // orderNumber is safe to log; publicToken deliberately is not — logs are
  // long-lived and the token grants read access to the order on its own.
  logger.info("Order captured", {
    orderId,
    orderNumber,
    lines: items.length,
    subtotal,
    customerRecorded: customerId !== null,
  });

  return {
    ok: true,
    orderId,
    orderNumber,
    publicToken,
    customerRecorded: customerId !== null,
  };
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Creates or updates the customer keyed on phone number.
 *
 * Consent handling is the delicate part:
 *   - ticking the box grants consent and stamps when and where;
 *   - NOT ticking it leaves an existing consent alone. A returning customer who
 *     ignores the checkbox has not withdrawn anything, and silently revoking it
 *     would lose a legitimate opt-in;
 *   - an existing `unsubscribed_at` is never cleared here. Withdrawal is
 *     deliberate and only the customer or an admin may reverse it, so a re-tick
 *     in the cart cannot resurrect a withdrawn consent.
 *
 * Name and city are only overwritten when non-empty, so a later order submitted
 * with blank fields does not erase details already on file.
 */
async function upsertCustomer(
  supabase: AdminClient,
  input: {
    phone: string;
    name?: string;
    cityAndPincode?: string;
    marketingConsent: boolean;
  },
): Promise<string | null> {
  const { data: existing, error: readError } = await supabase
    .from("customers")
    .select("id, marketing_consent, unsubscribed_at")
    .eq("phone", input.phone)
    .maybeSingle();

  if (readError) {
    logger.error("upsertCustomer read failed", { error: readError.message });
    return null;
  }

  const now = new Date().toISOString();

  if (!existing) {
    const { data: created, error } = await supabase
      .from("customers")
      .insert({
        phone: input.phone,
        name: input.name ?? null,
        city_and_pincode: input.cityAndPincode ?? null,
        marketing_consent: input.marketingConsent,
        marketing_consent_at: input.marketingConsent ? now : null,
        marketing_consent_source: input.marketingConsent ? "cart_checkbox" : null,
      })
      .select("id")
      .single();

    if (error || !created) {
      logger.error("upsertCustomer insert failed", { error: error?.message });
      return null;
    }

    return (created as { id: string }).id;
  }

  const row = existing as {
    id: string;
    marketing_consent: boolean;
    unsubscribed_at: string | null;
  };

  const update: Record<string, unknown> = { updated_at: now };
  if (input.name) update.name = input.name;
  if (input.cityAndPincode) update.city_and_pincode = input.cityAndPincode;

  // Grant only. Never downgrade an existing consent, never clear an unsubscribe.
  if (input.marketingConsent && !row.marketing_consent && row.unsubscribed_at === null) {
    update.marketing_consent = true;
    update.marketing_consent_at = now;
    update.marketing_consent_source = "cart_checkbox";
  }

  const { error } = await supabase.from("customers").update(update).eq("id", row.id);

  if (error) {
    logger.error("upsertCustomer update failed", { error: error.message });
    // The customer exists, so the order can still be attached to them.
  }

  return row.id;
}

/** Most recent still-unconfirmed order for this customer inside the window. */
async function findRecentInitiatedOrder(
  supabase: AdminClient,
  customerId: string,
): Promise<string | null> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("customer_id", customerId)
    .eq("status", "initiated")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Not fatal — fall through to inserting a new order.
    logger.warn("findRecentInitiatedOrder failed", { error: error.message });
    return null;
  }

  return data ? (data as { id: string }).id : null;
}
