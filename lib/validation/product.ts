import { z } from "zod";
import {
  checkboxSchema,
  emptyToUndefined,
  integerSchema,
  slugSchema,
  uuidSchema,
} from "@/lib/validation/common";
import type { ProductSpec } from "@/types/product";

/**
 * Server-side schema for the admin product form. This is the validation
 * boundary that counts — the browser form's `required`/`pattern` attributes are
 * a convenience only (DEVELOPMENT_STANDARDS.md §7).
 */

/** `numeric(12,2)`: ten digits before the decimal point, two after. */
const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;
const MAX_MONEY = 9_999_999_999.99;

/** Most images one product may carry in its gallery. */
export const MAX_GALLERY_ASSETS = 24;

/** Most "Label: Value" lines accepted in the specifications textarea. */
export const MAX_SPECS = 40;

/**
 * Money arrives from a text input. Empty becomes `undefined` (so "required" and
 * "optional" are decided by the schema, not by a silent coercion of "" to 0 —
 * price is quoted to the customer on WhatsApp and must never default itself).
 * Anything that is not a well-formed amount is passed through unchanged so the
 * number schema below reports it instead of producing NaN.
 */
function toMoney(value: unknown): unknown {
  if (typeof value !== "string") return value;

  // Admins paste amounts like "1,299.00" out of spreadsheets.
  const trimmed = value.trim().replace(/,/g, "");
  if (trimmed === "") return undefined;

  return MONEY_PATTERN.test(trimmed) ? Number(trimmed) : trimmed;
}

const priceSchema = z.preprocess(
  toMoney,
  z
    .number({ message: "Enter a price, for example 1299 or 1299.50." })
    .min(0, "Price cannot be negative.")
    .max(MAX_MONEY, "Price is too large."),
);

const originalPriceSchema = z.preprocess(
  toMoney,
  z
    .number({ message: "Enter an amount, for example 1799 or 1799.50." })
    .min(0, "Compare-at price cannot be negative.")
    .max(MAX_MONEY, "Compare-at price is too large.")
    .optional(),
);

const currencySchema = z
  .preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const normalized = value.trim().toUpperCase();
      return normalized === "" ? "INR" : normalized;
    },
    z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code, for example INR."),
  )
  .default("INR");

/**
 * Specifications are edited as plain text — one per line, `Label: Value` — and
 * stored in `products.features` as `[{label, value}]`. Splitting on the FIRST
 * colon only keeps values such as "Warranty: 2 years: parts only" intact.
 */
const specsSchema = z
  .string()
  .max(4000, "Specifications are too long (4,000 characters maximum).")
  .optional()
  .transform((value, ctx) => {
    const lines = (value ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length > MAX_SPECS) {
      ctx.addIssue({
        code: "custom",
        message: `Keep this to ${MAX_SPECS} specifications or fewer.`,
      });
      return z.NEVER;
    }

    const specs: ProductSpec[] = [];

    for (const [index, line] of lines.entries()) {
      const lineNumber = index + 1;
      const separatorAt = line.indexOf(":");

      if (separatorAt === -1) {
        ctx.addIssue({
          code: "custom",
          message: `Line ${lineNumber} has no colon. Write one specification per line as "Label: Value".`,
        });
        return z.NEVER;
      }

      const label = line.slice(0, separatorAt).trim();
      const specValue = line.slice(separatorAt + 1).trim();

      if (label === "") {
        ctx.addIssue({
          code: "custom",
          message: `Line ${lineNumber} has nothing before the colon. Write it as "Label: Value".`,
        });
        return z.NEVER;
      }

      if (specValue === "") {
        ctx.addIssue({
          code: "custom",
          message: `Line ${lineNumber} has nothing after the colon. Write it as "Label: Value".`,
        });
        return z.NEVER;
      }

      specs.push({ label, value: specValue });
    }

    return specs;
  });

/**
 * The gallery picker emits one `assetIds` input per selected asset. parseForm
 * collapses repeats into an array, but a single selection arrives as a bare
 * string and no selection omits the key entirely — normalise all three shapes
 * to `string[]`. Duplicates are dropped because `product_assets` is keyed on
 * (product_id, asset_id).
 */
const assetIdsSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return [];

    const entries = Array.isArray(value) ? value : [value];
    const unique: string[] = [];

    for (const entry of entries) {
      if (typeof entry !== "string") continue;
      const trimmed = entry.trim();
      if (trimmed === "" || unique.includes(trimmed)) continue;
      unique.push(trimmed);
    }

    return unique;
  },
  z
    .array(uuidSchema)
    .max(MAX_GALLERY_ASSETS, `Attach at most ${MAX_GALLERY_ASSETS} images to one product.`),
);

/**
 * At most one video per product. The picker is single-select, so this arrives
 * as a bare string or is omitted entirely; "" means "no video chosen".
 */
const videoAssetIdSchema = z.preprocess((value) => {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") return undefined;
  const trimmed = first.trim();
  return trimmed === "" ? undefined : trimmed;
}, uuidSchema.optional());

export const productInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Product name is required.")
    .max(200, "Product name is too long (200 characters maximum)."),
  slug: slugSchema,
  sku: emptyToUndefined(
    z
      .string()
      .trim()
      .max(64, "SKU is too long (64 characters maximum).")
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
        "Use letters, numbers, dots, dashes, underscores or slashes.",
      ),
  ),
  shortDescription: emptyToUndefined(
    z.string().trim().max(300, "Short description is too long (300 characters maximum)."),
  ),
  description: emptyToUndefined(
    z.string().trim().max(5000, "Description is too long (5,000 characters maximum)."),
  ),
  // Required even though the column is nullable: the storefront catalogue query
  // inner-joins categories, so an uncategorised product would silently never
  // appear on the public site.
  categoryId: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string({ message: "Choose a category." }).uuid("Choose a category."),
  ),
  price: priceSchema,
  originalPrice: originalPriceSchema,
  currency: currencySchema,
  isFeatured: checkboxSchema,
  isActive: checkboxSchema,
  sortOrder: z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? 0 : value),
      integerSchema({ min: 0, max: 100000 }),
    )
    .default(0),
  specs: specsSchema,
  assetIds: assetIdsSchema,
  videoAssetId: videoAssetIdSchema,
});

export const productUpdateSchema = productInputSchema.extend({ id: uuidSchema });

/** Archive/restore carry nothing but the row they act on. */
export const productIdSchema = z.object({ id: uuidSchema });

export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

/** Inverse of `specsSchema` — renders stored specs back into the textarea. */
export function formatSpecsForTextarea(specs: ProductSpec[]): string {
  return specs.map((spec) => `${spec.label}: ${spec.value}`).join("\n");
}
