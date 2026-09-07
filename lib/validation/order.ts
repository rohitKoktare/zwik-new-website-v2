import { z } from "zod";
import { checkboxSchema, uuidSchema, whatsappNumberSchema } from "@/lib/validation/common";

/**
 * Server-side schema for capturing an order at WhatsApp hand-off.
 *
 * This is the *only* validation boundary for data arriving from an anonymous
 * visitor's browser, so it is stricter than the admin schemas:
 *
 *   - Prices are NOT trusted from the client. The action re-reads every
 *     product's current price from the database and recomputes the totals; the
 *     posted line only supplies a product id and a quantity. A client-supplied
 *     price would let anyone write an order claiming a ₹1 product.
 *   - Line count and quantity are bounded, so a scripted post cannot insert
 *     thousands of rows.
 *   - Marketing consent defaults to false and is only ever true when the
 *     checkbox was actually ticked.
 */

/** Most distinct products one captured order may contain. */
export const MAX_ORDER_LINES = 50;
/** Most units of a single product. */
export const MAX_LINE_QTY = 99;

export const ORDER_NOTE_MAX_LENGTH = 600;
export const ORDER_NAME_MAX_LENGTH = 80;
export const ORDER_CITY_MAX_LENGTH = 120;

/**
 * A cart line as posted. Deliberately carries no money — see above.
 */
const orderLineSchema = z.object({
  productId: uuidSchema,
  qty: z
    .number()
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(MAX_LINE_QTY, `Quantity cannot exceed ${MAX_LINE_QTY}.`),
});

export const orderCaptureSchema = z.object({
  lines: z
    .array(orderLineSchema)
    .min(1, "Your cart is empty.")
    .max(MAX_ORDER_LINES, `An order cannot contain more than ${MAX_ORDER_LINES} products.`)
    .refine(
      (lines) => new Set(lines.map((l) => l.productId)).size === lines.length,
      "The same product appears more than once.",
    ),

  /**
   * Optional, deliberately.
   *
   * The phone number is the customer's identity in `customers`, so without it
   * no customer record can be created. It is still not required: every field in
   * the cart is optional today, and ordering with no form-filling at all is a
   * stated property of the architecture (ARCHITECTURE.md §5). ZWIK also learns
   * the number anyway — the customer messages them from it.
   *
   * So a blank phone captures the order with `customer_id` null rather than
   * blocking the hand-off. Trading a sale for a CRM row would be the wrong way
   * round.
   */
  phone: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    whatsappNumberSchema.optional(),
  ),

  name: z
    .string()
    .trim()
    .max(ORDER_NAME_MAX_LENGTH, "Name is too long.")
    .optional()
    .transform((value) => (value === "" ? undefined : value)),

  cityAndPincode: z
    .string()
    .trim()
    .max(ORDER_CITY_MAX_LENGTH, "City and pincode is too long.")
    .optional()
    .transform((value) => (value === "" ? undefined : value)),

  note: z
    .string()
    .trim()
    .max(ORDER_NOTE_MAX_LENGTH, `Keep the note under ${ORDER_NOTE_MAX_LENGTH} characters.`)
    .optional()
    .transform((value) => (value === "" ? undefined : value)),

  giftWrap: checkboxSchema,

  /**
   * Explicit marketing opt-in, separate from placing the order. Placing an
   * order is consent to be contacted *about that order* and nothing more, so
   * this must be its own deliberate act and defaults to false.
   */
  marketingConsent: checkboxSchema,
});

export type OrderCaptureInput = z.infer<typeof orderCaptureSchema>;
