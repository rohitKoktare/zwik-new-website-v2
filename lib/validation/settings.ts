import { z } from "zod";
import {
  checkboxSchema,
  emptyToUndefined,
  safeUrlSchema,
  whatsappNumberSchema,
} from "@/lib/validation/common";

/**
 * `numeric(12,2)`: ten digits before the decimal point, two after.
 * Blank means "no free-delivery offer", which is a real, chosen state — not a
 * validation failure — so it maps to undefined rather than 0. A ₹0 threshold
 * would read on the storefront as "free delivery on everything".
 */
const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

/** Shared money coercion for the two delivery amounts. */
function toDeliveryMoney(value: unknown): unknown {
  if (typeof value !== "string") return value;
  // Admins type "1,000" out of habit.
  const trimmed = value.trim().replace(/,/g, "");
  if (trimmed === "") return undefined;
  return MONEY_PATTERN.test(trimmed) ? Number(trimmed) : trimmed;
}

const freeDeliveryThresholdSchema = z.preprocess(
  toDeliveryMoney,
  z
    .number({ message: "Enter an amount, for example 500 or 499.50." })
    .min(1, "Use an amount above zero, or leave it blank to run no offer.")
    .max(9_999_999_999.99, "That amount is too large.")
    .optional(),
);

/**
 * Blank means "we do not quote a delivery charge on the site" — a real state,
 * distinct from 0, which would claim delivery is always free. Zero is still
 * allowed for anyone who genuinely wants to say that.
 */
const deliveryFeeSchema = z.preprocess(
  toDeliveryMoney,
  z
    .number({ message: "Enter an amount, for example 79, or leave it blank." })
    .min(0, "A delivery charge cannot be negative.")
    .max(9_999_999_999.99, "That amount is too large.")
    .optional(),
);

/**
 * Server-side schema for site settings.
 *
 * `whatsapp_number` is load-bearing: with it blank or WhatsApp disabled the
 * site cannot take an order at all (ARCHITECTURE.md §10). It is therefore
 * required whenever WhatsApp is enabled, enforced below via superRefine.
 */
export const settingsInputSchema = z
  .object({
    brandName: z.string().trim().min(1, "Brand name is required").max(80),
    whatsappEnabled: checkboxSchema,
    whatsappNumber: emptyToUndefined(whatsappNumberSchema),
    whatsappDefaultMessage: emptyToUndefined(z.string().trim().max(500)),
    instagramUrl: emptyToUndefined(safeUrlSchema),
    contactEmail: emptyToUndefined(z.string().trim().email("Enter a valid email address")),
    defaultSeoTitle: emptyToUndefined(z.string().trim().max(120)),
    defaultSeoDescription: emptyToUndefined(z.string().trim().max(320)),
    freeDeliveryThreshold: freeDeliveryThresholdSchema,
    deliveryFee: deliveryFeeSchema,
    deliveryScopeNote: emptyToUndefined(
      z
        .string()
        .trim()
        .max(80, "Keep this short — it sits inline next to the amount.")
        .refine((value) => !/[\r\n\t]/.test(value), "Must be a single short line"),
    ),
  })
  .superRefine((value, ctx) => {
    if (value.whatsappEnabled && !value.whatsappNumber) {
      ctx.addIssue({
        code: "custom",
        path: ["whatsappNumber"],
        message:
          "A WhatsApp number is required while WhatsApp ordering is enabled — without it customers cannot place an order.",
      });
    }

    // The scope note is rendered as "Free delivery over ₹500 <note>". Without a
    // threshold there is nothing for it to qualify, so it would never be shown.
    if (value.deliveryScopeNote && value.freeDeliveryThreshold === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["deliveryScopeNote"],
        message:
          "Set a free-delivery amount as well, or clear this — on its own it is never shown.",
      });
    }
  });

export type SettingsInput = z.infer<typeof settingsInputSchema>;
