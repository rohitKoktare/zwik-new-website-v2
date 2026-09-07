import { z } from "zod";

/** Lowercase, hyphen-separated URL slug. */
export const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(200, "Slug is too long")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only");

/**
 * A URL safe to put in an href. Rejects `javascript:`, `data:` and friends —
 * only absolute http(s) or site-relative paths are allowed
 * (DATABASE_DESIGN.md §14: avoid open redirects / dangerous schemes).
 */
export const safeUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      if (value.startsWith("/") && !value.startsWith("//")) return true;
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Must be an https:// URL or a site-relative path starting with /" },
  );

/**
 * Default country calling code. ZWIK ships only within India
 * (ARCHITECTURE.md §18), so a bare 10-digit mobile number is Indian.
 */
const DEFAULT_COUNTRY_CODE = "91";

/**
 * Normalises a phone number to the digits `wa.me/<digits>` expects, including
 * the country code.
 *
 * The country code is NOT optional to wa.me: `wa.me/9876543210` does not resolve
 * to a chat, and the design reference hardcoded `wa.me/91` + the local number
 * for exactly this reason. But customers type their number the way they say it
 * — ten digits, no prefix — so it has to be added here rather than demanded of
 * them. Without this, a captured customer's number produced a dead reply link.
 *
 * Handled inputs:
 *   9876543210        -> 919876543210   (bare local mobile)
 *   09876543210       -> 919876543210   (STD trunk prefix)
 *   +91 98765 43210   -> 919876543210   (already qualified)
 *   0091-9876543210   -> 919876543210   (00 international prefix)
 *
 * A number that already carries some other country code is left alone — this
 * only fills in a missing one, it never rewrites a deliberate choice.
 */
export function normalizeWhatsAppNumber(input: string): string {
  let digits = input.replace(/[^0-9]/g, "");

  // 00 international prefix.
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Indian STD trunk prefix on a local mobile: 0 followed by 10 digits.
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);

  // A bare 10-digit local number needs the country code.
  if (digits.length === 10) digits = DEFAULT_COUNTRY_CODE + digits;

  return digits;
}

/**
 * WhatsApp number normalised to digits only, including country code.
 * Stored and used exactly as `wa.me/<digits>` expects.
 */
export const whatsappNumberSchema = z
  .string()
  .trim()
  .transform(normalizeWhatsAppNumber)
  .refine((value) => value.length >= 11 && value.length <= 15, {
    message: "Enter a valid mobile number (10 digits, or include the country code)",
  });

/** Turns "" into undefined so optional fields don't fail as empty strings. */
export const emptyToUndefined = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );

/** HTML checkbox: present ("on"/"true") means true, absent means false. */
export const checkboxSchema = z
  .preprocess(
    (value) => value === "on" || value === "true" || value === true,
    z.boolean(),
  )
  .default(false);

/** Numeric form field arriving as a string. */
export const numericSchema = (opts?: { min?: number; max?: number }) =>
  z.preprocess(
    (value) => (typeof value === "string" ? Number(value.trim()) : value),
    z
      .number({ message: "Enter a valid number" })
      .refine((n) => Number.isFinite(n), "Enter a valid number")
      .refine((n) => (opts?.min === undefined ? true : n >= opts.min), `Must be at least ${opts?.min}`)
      .refine((n) => (opts?.max === undefined ? true : n <= opts.max), `Must be at most ${opts?.max}`),
  );

export const integerSchema = (opts?: { min?: number; max?: number }) =>
  z.preprocess(
    (value) => (typeof value === "string" ? Number.parseInt(value.trim(), 10) : value),
    z
      .number({ message: "Enter a whole number" })
      .int("Enter a whole number")
      .refine((n) => (opts?.min === undefined ? true : n >= opts.min), `Must be at least ${opts?.min}`)
      .refine((n) => (opts?.max === undefined ? true : n <= opts.max), `Must be at most ${opts?.max}`),
  );

export const uuidSchema = z.string().uuid("Invalid identifier");

/**
 * A repeated form field (multi-select, checkbox group, AssetPicker) normalised
 * to an array.
 *
 * FormData has no concept of arity: selecting one item yields a bare string,
 * several yields an array, and none omits the key entirely. Without this, a
 * `z.array()` schema fails on exactly the single-selection case — which is the
 * common one, so the bug reaches production easily. Verified against Zod v4.
 */
export const idListSchema = z.preprocess(
  (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]),
  z.array(uuidSchema),
);

/** Same normalisation, for a field that holds at most one id. */
export const optionalIdSchema = z.preprocess((value) => {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim() === "" ? undefined : first;
}, uuidSchema.optional());

/** Builds a slug candidate from a name; the result still has to pass slugSchema. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}
