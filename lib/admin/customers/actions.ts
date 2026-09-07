"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DESTRUCTIVE_ROLES, getAuthorizedActor } from "@/lib/auth/guard";
import { getCustomerById } from "@/lib/supabase/queries/admin-customers";
import { diffRecords, recordAuditEvent } from "@/lib/audit";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { logger } from "@/lib/logger";
import { uuidSchema } from "@/lib/validation/common";
import {
  actionError,
  actionSuccess,
  parseForm,
  type ActionResult,
} from "@/lib/admin/action-result";

/**
 * Customer record mutations: consent, notes, and erasure.
 *
 * Consent is the sensitive part. Two rules are enforced here rather than left
 * to the UI:
 *
 *   - **An admin can withdraw consent, never grant it.** Consent has to come
 *     from the customer. A button that let staff tick "yes they agreed" would
 *     manufacture the evidence the record exists to hold, so there is no such
 *     action — only unsubscribe, and a re-subscribe that requires the admin to
 *     state where the customer actually asked.
 *   - **Erasure is real.** Deleting a customer removes the personal data and
 *     leaves `orders.customer_id` null, so the sales record survives in
 *     anonymous form (migration 0012 §2). This is the DPDP Act erasure path,
 *     which is why it is a hard delete and not an archive flag.
 */

const CUSTOMERS_PATH = "/admin/customers";
const PERMISSION_ERROR = "You don't have permission to change customer records.";
const DELETE_PERMISSION_ERROR = "You don't have permission to delete a customer record.";
const MISSING_ERROR = "That customer record no longer exists.";

const customerIdSchema = z.object({ id: uuidSchema });

const noteSchema = z.object({
  id: uuidSchema,
  adminNote: z
    .string()
    .trim()
    .max(1000, "Keep the note under 1,000 characters.")
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
});

const resubscribeSchema = z.object({
  id: uuidSchema,
  /**
   * Where the customer asked to be re-subscribed. Required and free-text on
   * purpose: re-granting a withdrawn consent has to be traceable to something
   * the customer actually said.
   */
  source: z
    .string()
    .trim()
    .min(3, "Say where the customer asked to be re-subscribed.")
    .max(120, "Keep this short."),
});

/** Marketing consent withdrawn. Always available, always takes effect at once. */
export async function unsubscribeCustomerAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(customerIdSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id } = parsed.data;

  const before = await getCustomerById(id);
  if (!before) return actionError(MISSING_ERROR);
  if (before.unsubscribedAt !== null) {
    return actionSuccess("This customer is already unsubscribed.");
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  // `marketing_consent` is left as-is and `unsubscribed_at` is set instead, so
  // the record still shows that consent was once given and when it was
  // withdrawn. Every send checks both.
  const { error } = await supabase
    .from("customers")
    .update({ unsubscribed_at: now, updated_at: now })
    .eq("id", id);

  if (error) {
    logger.error("unsubscribeCustomerAction failed", {
      actorId: actor.id,
      customerId: id,
      error: error.message,
    });
    return actionError("Couldn't unsubscribe that customer. Please try again.");
  }

  const { before: beforeDiff, after: afterDiff } = diffRecords(
    { unsubscribed: false },
    { unsubscribed: true },
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: "update",
    entityType: "customer",
    entityId: id,
    before: beforeDiff,
    after: afterDiff,
    metadata: { consentChange: "withdrawn" },
  });

  revalidateAdmin(CUSTOMERS_PATH);
  revalidateAdmin(`${CUSTOMERS_PATH}/${id}`);

  return actionSuccess("Unsubscribed. They will be excluded from every campaign.");
}

/** Reverses an unsubscribe, only with a stated reason. */
export async function resubscribeCustomerAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(resubscribeSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id, source } = parsed.data;

  const before = await getCustomerById(id);
  if (!before) return actionError(MISSING_ERROR);
  if (before.unsubscribedAt === null && before.marketingConsent) {
    return actionSuccess("This customer is already subscribed.");
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("customers")
    .update({
      unsubscribed_at: null,
      marketing_consent: true,
      marketing_consent_at: now,
      marketing_consent_source: `admin: ${source}`,
      updated_at: now,
    })
    .eq("id", id);

  if (error) {
    logger.error("resubscribeCustomerAction failed", {
      actorId: actor.id,
      customerId: id,
      error: error.message,
    });
    return actionError("Couldn't re-subscribe that customer. Please try again.");
  }

  await recordAuditEvent({
    actorId: actor.id,
    action: "update",
    entityType: "customer",
    entityId: id,
    before: { marketingConsent: before.marketingConsent, unsubscribed: true },
    after: { marketingConsent: true, unsubscribed: false },
    // The stated source is the whole point of this action; keep it in the log.
    metadata: { consentChange: "re-granted", statedSource: source },
  });

  revalidateAdmin(CUSTOMERS_PATH);
  revalidateAdmin(`${CUSTOMERS_PATH}/${id}`);

  return actionSuccess("Re-subscribed, with the reason recorded in the audit log.");
}

export async function updateCustomerNoteAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(noteSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id, adminNote } = parsed.data;

  const before = await getCustomerById(id);
  if (!before) return actionError(MISSING_ERROR);

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ admin_note: adminNote ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.error("updateCustomerNoteAction failed", {
      actorId: actor.id,
      customerId: id,
      error: error.message,
    });
    return actionError("Couldn't save that note. Please try again.");
  }

  // The note itself is not copied into the audit payload — it is free text an
  // admin may have put personal details in, and audit rows are long-lived.
  await recordAuditEvent({
    actorId: actor.id,
    action: "update",
    entityType: "customer",
    entityId: id,
    before: { hasNote: before.adminNote !== null },
    after: { hasNote: adminNote !== undefined },
  });

  revalidateAdmin(`${CUSTOMERS_PATH}/${id}`);

  return actionSuccess("Note saved.");
}

/**
 * Erases a customer's personal data.
 *
 * Hard delete, deliberately. An archive flag would leave the phone number in
 * the database, which is exactly what an erasure request asks you to remove.
 * `orders.customer_id` is `on delete set null`, so the orders survive without
 * anything identifying attached.
 *
 * Gated behind DESTRUCTIVE_ROLES like every other permanent delete.
 */
export async function deleteCustomerAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor(DESTRUCTIVE_ROLES);
  if (!actor) return actionError(DELETE_PERMISSION_ERROR);

  const parsed = parseForm(customerIdSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id } = parsed.data;

  const before = await getCustomerById(id);
  if (!before) return actionError(MISSING_ERROR);

  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);

  if (error) {
    logger.error("deleteCustomerAction failed", {
      actorId: actor.id,
      customerId: id,
      error: error.message,
    });
    return actionError("Couldn't delete that record. Please try again.");
  }

  /**
   * The audit entry records *that* an erasure happened and how much history it
   * detached — never the phone number or name. Copying the identifiers into an
   * audit row every admin can read would defeat the erasure. (`scrub()` also
   * redacts phone-like keys, so this is belt and braces.)
   */
  await recordAuditEvent({
    actorId: actor.id,
    action: "delete",
    entityType: "customer",
    entityId: id,
    before: {
      hadName: before.name !== null,
      orderCount: before.orderCount,
      confirmedOrderCount: before.confirmedOrderCount,
      marketingConsent: before.marketingConsent,
    },
    after: null,
    metadata: { reason: "erasure", ordersRetainedAnonymously: before.orderCount },
  });

  revalidateAdmin(CUSTOMERS_PATH);
  revalidateAdmin("/admin/orders");

  return actionSuccess(
    before.orderCount > 0
      ? `Personal data erased. ${before.orderCount} ${before.orderCount === 1 ? "order" : "orders"} kept without any contact details attached.`
      : "Personal data erased.",
  );
}
