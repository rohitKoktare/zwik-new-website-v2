import { z } from "zod";
import {
  checkboxSchema,
  emptyToUndefined,
  integerSchema,
  slugSchema,
  uuidSchema,
} from "@/lib/validation/common";

/**
 * Category validation.
 *
 * A category's `slug` is load-bearing in a way most content fields are not:
 *
 *   - it is the public `?place=` filter value on /products, so changing it
 *     breaks any link a customer has saved or ZWIK has shared;
 *   - `lib/store/category-accent.ts` keys the category's brand accent colour
 *     off it, so an unrecognised slug falls back to plain grey.
 *
 * Neither is a reason to block a rename, but both are reasons the admin form
 * must say so plainly before one is saved.
 */

export const CATEGORY_NAME_MAX_LENGTH = 60;
export const CATEGORY_DESCRIPTION_MAX_LENGTH = 500;

/** Blank sort order means "no explicit position", i.e. the column default. */
const categorySortOrderSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? 0 : value),
  integerSchema({ min: 0, max: 9999 }),
);

export const categoryInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(CATEGORY_NAME_MAX_LENGTH, "Name is too long")
    .refine((value) => !/[\r\n\t]/.test(value), "Name must be a single line"),
  slug: slugSchema,
  description: emptyToUndefined(
    z
      .string()
      .trim()
      .max(
        CATEGORY_DESCRIPTION_MAX_LENGTH,
        `Keep the description under ${CATEGORY_DESCRIPTION_MAX_LENGTH} characters`,
      ),
  ),
  isActive: checkboxSchema,
  sortOrder: categorySortOrderSchema,
});

export const categoryUpdateSchema = categoryInputSchema.extend({ id: uuidSchema });

/** Archive/restore/delete only need to identify the row. */
export const categoryIdSchema = z.object({ id: uuidSchema });

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
