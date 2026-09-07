import { z } from "zod";
import {
  checkboxSchema,
  emptyToUndefined,
  integerSchema,
  numericSchema,
  uuidSchema,
} from "@/lib/validation/common";

/**
 * Review validation.
 *
 * DATABASE_DESIGN.md §8: ordering happens over WhatsApp rather than an on-site
 * checkout, so ZWIK cannot verify that a reviewer bought anything. Reviews are
 * marketing/content data — never "verified purchase" reviews.
 *
 * `source` therefore records where a review genuinely came from and is a
 * required, deliberate choice. It is never defaulted silently on create, and
 * an existing custom value (from an older row) stays valid so an edit cannot
 * quietly rewrite an attribution.
 */

/** Sources offered in the admin UI. Stored verbatim in reviews.source. */
export const REVIEW_SOURCES = [
  "whatsapp",
  "instagram",
  "amazon",
  "email",
  "direct",
] as const;

export type ReviewSource = (typeof REVIEW_SOURCES)[number];

export const REVIEW_SOURCE_LABELS: Record<ReviewSource, string> = {
  whatsapp: "WhatsApp conversation",
  instagram: "Instagram",
  amazon: "Amazon",
  email: "Email",
  direct: "Sent directly to ZWIK",
};

/**
 * Human-readable label for a stored source. Falls back to the raw value so a
 * custom attribution written before these options existed is still displayed
 * accurately rather than being relabelled.
 */
export function reviewSourceLabel(source: string): string {
  const labels: Record<string, string | undefined> = REVIEW_SOURCE_LABELS;
  return labels[source] ?? source;
}

export const REVIEW_TEXT_MAX_LENGTH = 2000;
export const REVIEW_NAME_MAX_LENGTH = 80;

/**
 * Rating in half-star steps, matching reviews.rating numeric(2,1) 0..5.
 *
 * Blank input is mapped to undefined before numericSchema sees it: Number("")
 * is 0, which would otherwise save an untouched field as a 0-star review.
 */
export const reviewRatingSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  numericSchema({ min: 0, max: 5 }).refine(
    (value) => Number.isInteger(value * 2),
    "Use half-star steps only — for example 4 or 4.5",
  ),
);

/** Blank sort order means "no explicit position", i.e. the column default. */
const reviewSortOrderSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? 0 : value),
  integerSchema({ min: 0, max: 9999 }),
);

/**
 * A short attribution label. Deliberately permissive about characters so an
 * existing custom value survives an edit, but it must be a single plain line.
 */
const reviewSourceSchema = z
  .string()
  .trim()
  .min(1, "Choose where this review came from")
  .max(60, "Source is too long")
  .refine((value) => !/[\r\n\t]/.test(value), "Source must be a single short label");

export const reviewInputSchema = z.object({
  // The product select posts "" until a choice is made; catching that here
  // gives a useful message instead of uuidSchema's generic one.
  productId: z
    .string()
    .trim()
    .min(1, "Choose the product this review is about")
    .pipe(uuidSchema),
  customerDisplayName: z
    .string()
    .trim()
    .min(1, "Customer name is required")
    .max(REVIEW_NAME_MAX_LENGTH, "Name is too long"),
  rating: reviewRatingSchema,
  reviewText: z
    .string()
    .trim()
    .min(1, "Review text is required")
    .max(REVIEW_TEXT_MAX_LENGTH, `Keep the review under ${REVIEW_TEXT_MAX_LENGTH} characters`),
  source: reviewSourceSchema,
  imageAssetId: emptyToUndefined(uuidSchema),
  isFeatured: checkboxSchema,
  isActive: checkboxSchema,
  sortOrder: reviewSortOrderSchema,
});

export const reviewUpdateSchema = reviewInputSchema.extend({ id: uuidSchema });

/** Archive/restore only need to identify the row. */
export const reviewIdSchema = z.object({ id: uuidSchema });

export type ReviewInput = z.infer<typeof reviewInputSchema>;
export type ReviewUpdateInput = z.infer<typeof reviewUpdateSchema>;
