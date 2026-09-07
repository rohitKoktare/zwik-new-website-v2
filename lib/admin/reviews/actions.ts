"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedActor } from "@/lib/auth/guard";
import { getReviewById, type AdminReview } from "@/lib/supabase/queries/admin-reviews";
import {
  reviewIdSchema,
  reviewInputSchema,
  reviewUpdateSchema,
  type ReviewInput,
} from "@/lib/validation/review";
import { diffRecords, recordAuditEvent } from "@/lib/audit";
import { revalidateAdmin, revalidateHomepage } from "@/lib/admin/revalidate";
import { logger } from "@/lib/logger";
import {
  actionError,
  actionSuccess,
  parseForm,
  type ActionResult,
} from "@/lib/admin/action-result";

/**
 * Review mutations. Every action follows the house order:
 *
 *   1. Authorize (independently of any layout guard)
 *   2. Validate with Zod
 *   3. Read the "before" row for the audit trail
 *   4. Write through the RLS-enforced client
 *   5. Audit
 *   6. Revalidate affected public pages
 *   7. Return a safe, human-readable result
 *
 * Reviews are editorial content, so any admin role (including CONTENT_MANAGER)
 * may write them. Archiving is reversible and therefore not gated behind
 * DESTRUCTIVE_ROLES; there is no hard delete at all.
 *
 * Database and exception text is logged, never returned to the browser
 * (DEVELOPMENT_STANDARDS.md §14).
 */

const REVIEWS_PATH = "/admin/reviews";
const PERMISSION_ERROR = "You don't have permission to change reviews.";
const SAVE_ERROR =
  "Couldn't save the review. Check the selected product and image, then try again.";
const MISSING_ERROR = "That review no longer exists. It may have been removed.";

function toRow(input: ReviewInput) {
  return {
    product_id: input.productId,
    customer_display_name: input.customerDisplayName,
    rating: input.rating,
    review_text: input.reviewText,
    image_asset_id: input.imageAssetId ?? null,
    source: input.source,
    is_featured: input.isFeatured,
    is_active: input.isActive,
    sort_order: input.sortOrder,
  };
}

function auditFromReview(review: AdminReview): Record<string, unknown> {
  return {
    productId: review.productId,
    customerDisplayName: review.customerDisplayName,
    rating: review.rating,
    reviewText: review.reviewText,
    imageAssetId: review.imageAssetId,
    source: review.source,
    isFeatured: review.isFeatured,
    isActive: review.isActive,
    sortOrder: review.sortOrder,
  };
}

function auditFromInput(input: ReviewInput): Record<string, unknown> {
  return {
    productId: input.productId,
    customerDisplayName: input.customerDisplayName,
    rating: input.rating,
    reviewText: input.reviewText,
    imageAssetId: input.imageAssetId ?? null,
    source: input.source,
    isFeatured: input.isFeatured,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
}

/**
 * The homepage renders getFeaturedReviews(), which requires is_active AND
 * is_featured. Spell the resulting visibility out so nobody has to guess why a
 * saved review did not appear.
 */
function visibilityMessage(state: { isActive: boolean; isFeatured: boolean }): string {
  if (!state.isActive) {
    return "It is hidden, so it does not appear anywhere on the site.";
  }
  if (!state.isFeatured) {
    return "It is active but not featured, so it will not appear on the homepage.";
  }
  return "It is active and featured, so it can appear on the homepage.";
}

export async function createReviewAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Authorize.
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  // 2. Validate.
  const parsed = parseForm(reviewInputSchema, formData);
  if (!parsed.success) return parsed.result;
  const input = parsed.data;

  // 3. No "before" state — the row does not exist yet.

  // 4. Write.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .insert(toRow(input))
    .select("id")
    .single();

  if (error) {
    logger.error("createReviewAction failed", {
      actorId: actor.id,
      error: error.message,
    });
    return actionError(SAVE_ERROR);
  }

  // 5. Audit.
  const created = data as { id: string } | null;
  const { before, after } = diffRecords(null, auditFromInput(input));

  await recordAuditEvent({
    actorId: actor.id,
    action: "create",
    entityType: "review",
    entityId: created?.id ?? null,
    before,
    after,
  });

  // 6. Revalidate. The homepage is the only public surface rendering reviews
  //    today; the admin list is refreshed so the new row shows up there.
  revalidateHomepage();
  revalidateAdmin(REVIEWS_PATH);

  // 7. Result. The create form holds no id, so leaving it mounted invites a
  //    duplicate on a second submit — send the admin to the list instead.
  //    redirect() throws, so it is last and never inside a try block.
  redirect(`${REVIEWS_PATH}?saved=created`);
}

export async function updateReviewAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(reviewUpdateSchema, formData);
  if (!parsed.success) return parsed.result;
  const input = parsed.data;

  const before = await getReviewById(input.id);
  if (!before) return actionError(MISSING_ERROR);

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({ ...toRow(input), updated_at: new Date().toISOString() })
    .eq("id", input.id);

  if (error) {
    logger.error("updateReviewAction failed", {
      actorId: actor.id,
      reviewId: input.id,
      error: error.message,
    });
    return actionError(SAVE_ERROR);
  }

  const { before: beforeDiff, after: afterDiff } = diffRecords(
    auditFromReview(before),
    auditFromInput(input),
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: "update",
    entityType: "review",
    entityId: input.id,
    before: beforeDiff,
    after: afterDiff,
    // Attribution is the integrity-sensitive field here, so a change to it is
    // flagged explicitly rather than left buried in the diff.
    metadata: before.source !== input.source ? { attributionChanged: true } : null,
  });

  revalidateHomepage();
  revalidateAdmin(REVIEWS_PATH);
  revalidateAdmin(`${REVIEWS_PATH}/${input.id}`);

  return actionSuccess(`Review saved. ${visibilityMessage(input)}`);
}

/** Archive = hide. Reviews are never hard-deleted. */
export async function archiveReviewAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(reviewIdSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id } = parsed.data;

  const before = await getReviewById(id);
  if (!before) return actionError(MISSING_ERROR);
  if (!before.isActive) return actionSuccess("That review is already hidden.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.error("archiveReviewAction failed", {
      actorId: actor.id,
      reviewId: id,
      error: error.message,
    });
    return actionError("Couldn't archive that review. Please try again.");
  }

  const { before: beforeDiff, after: afterDiff } = diffRecords(
    { isActive: true },
    { isActive: false },
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: "archive",
    entityType: "review",
    entityId: id,
    before: beforeDiff,
    after: afterDiff,
  });

  revalidateHomepage();
  revalidateAdmin(REVIEWS_PATH);

  return actionSuccess("Review archived. It no longer appears on the site.");
}

export async function restoreReviewAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(reviewIdSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id } = parsed.data;

  const before = await getReviewById(id);
  if (!before) return actionError(MISSING_ERROR);
  if (before.isActive) return actionSuccess("That review is already active.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.error("restoreReviewAction failed", {
      actorId: actor.id,
      reviewId: id,
      error: error.message,
    });
    return actionError("Couldn't restore that review. Please try again.");
  }

  const { before: beforeDiff, after: afterDiff } = diffRecords(
    { isActive: false },
    { isActive: true },
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: "restore",
    entityType: "review",
    entityId: id,
    before: beforeDiff,
    after: afterDiff,
  });

  revalidateHomepage();
  revalidateAdmin(REVIEWS_PATH);

  return actionSuccess(
    `Review restored. ${visibilityMessage({ isActive: true, isFeatured: before.isFeatured })}`,
  );
}
