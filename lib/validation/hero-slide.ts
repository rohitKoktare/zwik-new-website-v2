import { z } from "zod";
import {
  checkboxSchema,
  emptyToUndefined,
  integerSchema,
  safeUrlSchema,
  uuidSchema,
} from "@/lib/validation/common";

/**
 * Hero slide + featured product validation.
 *
 * This is the server-side boundary for everything the homepage admin writes
 * (DEVELOPMENT_STANDARDS.md §7). The database also enforces the important
 * invariants — `cta_type` is a CHECK-constrained enum and `cta_url` must match
 * `^(https?:)?/` — but a constraint violation surfaces as a raw Postgres error,
 * which must never reach a user. Validating here means the admin gets a field
 * message instead (migration 0006).
 */

/** `cta_type` values the database CHECK constraint accepts. */
export const HERO_CTA_TYPES = ["catalog", "product", "url"] as const;
export type HeroCtaType = (typeof HERO_CTA_TYPES)[number];

/**
 * Form-level value set. The column is nullable, but a <select> cannot post
 * "null" — "none" is the UI's way of saying "this slide has no button", and
 * the action maps it back to NULL before writing.
 */
export const HERO_CTA_FORM_VALUES = ["none", ...HERO_CTA_TYPES] as const;
export type HeroCtaFormValue = (typeof HERO_CTA_FORM_VALUES)[number];

export const HERO_CTA_OPTIONS: ReadonlyArray<{
  value: HeroCtaFormValue;
  label: string;
}> = [
  { value: "none", label: "No button" },
  { value: "catalog", label: "Button opens the catalogue" },
  { value: "product", label: "Button opens a product page" },
  { value: "url", label: "Button opens a specific link" },
];

/**
 * `<AssetPicker>` emits the chosen asset as a hidden input, so a single-select
 * picker posts either nothing, one value, or — if the markup ever changes —
 * several. Normalised here to one optional uuid so the action never has to
 * care which shape arrived.
 */
const optionalAssetIdSchema = z.preprocess((value) => {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string" || first.trim() === "") return undefined;
  return first.trim();
}, uuidSchema.optional());

/**
 * Datetime handling.
 *
 * `<input type="datetime-local">` posts "YYYY-MM-DDTHH:mm" with no timezone at
 * all. Interpreting that string in "the runtime's local time" would make the
 * stored instant depend on the server's TZ (UTC on Vercel, something else on a
 * laptop) and would not round-trip. So the admin UI declares these fields as
 * UTC and we parse them as UTC explicitly — storage stays UTC per
 * DATABASE_DESIGN.md §16, and edit → save → edit is stable.
 *
 * Both helpers are pure and take their input as an argument: no bare
 * `new Date()` that could differ between server render and hydration.
 */
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** "2026-03-01T09:30" → "2026-03-01T09:30:00.000Z". Returns null if unusable. */
export function parseAdminDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (!DATETIME_LOCAL_PATTERN.test(trimmed)) return null;

  // Date.parse rejects impossible calendar dates (e.g. 2026-02-31) as NaN.
  const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
  const ms = Date.parse(`${withSeconds}Z`);

  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** "2026-03-01T09:30:00.000Z" → "2026-03-01T09:30", the shape the input wants. */
export function toDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toISOString().slice(0, 16);
}

const adminDateTimeSchema = z
  .string()
  .refine((value) => parseAdminDateTime(value) !== null, "Enter a valid date and time")
  .transform((value) => parseAdminDateTime(value)!);

const ctaTypeSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : "none"),
  z.enum(HERO_CTA_FORM_VALUES, { message: "Choose one of the listed button actions" }),
);

export const heroSlideInputSchema = z
  .object({
    assetId: optionalAssetIdSchema,
    heading: z
      .string()
      .trim()
      .min(1, "Heading is required")
      .max(120, "Keep the heading under 120 characters"),
    subheading: emptyToUndefined(
      z.string().trim().max(280, "Keep the subheading under 280 characters"),
    ),
    ctaLabel: emptyToUndefined(
      z.string().trim().max(40, "Keep the button label under 40 characters"),
    ),
    ctaType: ctaTypeSchema,
    ctaUrl: emptyToUndefined(safeUrlSchema),
    isActive: checkboxSchema,
    // A missing number input must not become NaN — an absent value means 0.
    sortOrder: z.preprocess(
      (value) => (value === undefined || value === "" ? "0" : value),
      integerSchema({ min: 0, max: 9999 }),
    ),
    startsAt: emptyToUndefined(adminDateTimeSchema),
    endsAt: emptyToUndefined(adminDateTimeSchema),
  })
  .superRefine((value, ctx) => {
    if (value.ctaType === "url" && !value.ctaUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["ctaUrl"],
        message: "Add the link this button should open.",
      });
    }

    if (value.ctaType !== "none" && !value.ctaLabel) {
      ctx.addIssue({
        code: "custom",
        path: ["ctaLabel"],
        message: "Give the button a label — an unlabelled button cannot be shown.",
      });
    }

    if (value.startsAt && value.endsAt) {
      if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
        ctx.addIssue({
          code: "custom",
          path: ["endsAt"],
          message: "The end time must be after the start time.",
        });
      }
    }
  });

export type HeroSlideInput = z.infer<typeof heroSlideInputSchema>;

/** Archive/restore, which carry nothing but the row id. */
export const heroSlideIdSchema = z.object({ id: uuidSchema });

/**
 * Repeated form fields arrive as a string, an array of strings, or nothing at
 * all (zero checkboxes ticked). Normalised to an array either way.
 */
const idListSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === "") return [];
    return Array.isArray(value) ? value : [value];
  },
  z.array(uuidSchema).max(100, "Too many products in one save"),
);

/**
 * Featured-product panel. `productIds` is the full set of rows the admin was
 * shown (one page of the list); `featuredIds` is the subset they ticked.
 * Sending both means an unticked box is a deliberate "not featured" rather
 * than indistinguishable from "not on screen" — HTML omits unchecked boxes.
 */
export const featuredProductsInputSchema = z.object({
  productIds: idListSchema,
  featuredIds: idListSchema,
});

export type FeaturedProductsInput = z.infer<typeof featuredProductsInputSchema>;
