import { z } from "zod";

/**
 * Uniform return shape for every admin server action, designed for React 19's
 * `useActionState`. Keeping one shape means the form components never need to
 * know which entity they are editing.
 *
 * Never put raw database or exception text in `formError` — it reaches the
 * browser. Log the technical detail server-side and return a friendly message
 * (DEVELOPMENT_STANDARDS.md §14).
 */
export type ActionResult = {
  ok: boolean;
  /** Message shown at the top of the form. Safe, human-readable text only. */
  formError?: string;
  /** Per-field validation messages, keyed by form field name. */
  fieldErrors?: Record<string, string[]>;
  /** Optional success message for a toast. */
  message?: string;
};

export const IDLE_RESULT: ActionResult = { ok: false };

export function actionSuccess(message?: string): ActionResult {
  return { ok: true, message };
}

export function actionError(formError: string): ActionResult {
  return { ok: false, formError };
}

export function validationError(fieldErrors: Record<string, string[]>): ActionResult {
  return {
    ok: false,
    formError: "Please correct the highlighted fields.",
    fieldErrors,
  };
}

/**
 * Validates FormData against a Zod schema.
 *
 * This is the server-side validation boundary — the only one that counts.
 * Client-side constraints are a convenience, never a guarantee
 * (DEVELOPMENT_STANDARDS.md §7).
 */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { success: true; data: z.infer<T> } | { success: false; result: ActionResult } {
  const raw: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    // Collapse repeated field names (multi-selects, multi-file uploads) into
    // an array. A File collapses the same way a string does — an earlier
    // version of this function special-cased File to always overwrite the
    // previous value, which silently dropped every file but the last one out
    // of a multi-file <input>.
    const existing = raw[key];
    if (existing === undefined) {
      raw[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      raw[key] = [existing, value];
    }
  }

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { success: false, result: validationError(fieldErrors) };
  }

  return { success: true, data: parsed.data };
}
