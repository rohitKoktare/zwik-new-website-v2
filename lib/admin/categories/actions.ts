"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DESTRUCTIVE_ROLES, getAuthorizedActor } from "@/lib/auth/guard";
import {
  getCategoryById,
  type AdminCategory,
} from "@/lib/supabase/queries/admin-categories";
import {
  categoryIdSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  type CategoryInput,
} from "@/lib/validation/category";
import { diffRecords, recordAuditEvent } from "@/lib/audit";
import { revalidateAdmin, revalidateCatalog } from "@/lib/admin/revalidate";
import { logger } from "@/lib/logger";
import {
  actionError,
  actionSuccess,
  parseForm,
  validationError,
  type ActionResult,
} from "@/lib/admin/action-result";

/**
 * Category mutations. Every action follows the house order:
 *
 *   1. Authorize (independently of any layout guard)
 *   2. Validate with Zod
 *   3. Read the "before" row for the audit trail
 *   4. Write through the RLS-enforced client
 *   5. Audit
 *   6. Revalidate affected public pages
 *   7. Return a safe, human-readable result
 *
 * Categories are structural rather than purely editorial: a category's slug is
 * the public `?place=` filter on /products, and products.category_id is
 * `on delete restrict`. So while any admin role may create and edit them,
 * permanent deletion is gated behind DESTRUCTIVE_ROLES — consistent with how
 * the rest of the admin treats destroy-vs-archive.
 *
 * Database and exception text is logged, never returned to the browser
 * (DEVELOPMENT_STANDARDS.md §14).
 */

const CATEGORIES_PATH = "/admin/categories";
const PERMISSION_ERROR = "You don't have permission to change categories.";
const DELETE_PERMISSION_ERROR = "You don't have permission to delete a category.";
const SAVE_ERROR = "Couldn't save the category. Please try again.";
const MISSING_ERROR = "That category no longer exists. It may have been removed.";

/** The parts of a PostgREST error this module is allowed to look at. */
type WriteError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

/**
 * Turns a Postgres unique-violation into a friendly, field-level message.
 * The database text itself never leaves the server — it is only inspected here
 * to work out which column collided (DEVELOPMENT_STANDARDS.md §14).
 */
function uniqueViolationResult(error: WriteError): ActionResult | null {
  if (error.code !== "23505") return null;

  const constraint = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  if (constraint.includes("slug")) {
    return validationError({
      slug: ["That slug is already used by another category. Try a different one."],
    });
  }

  return actionError("Another category already uses one of these values.");
}

/** Maps validated form input onto the `categories` column names. */
function toCategoryRow(input: CategoryInput) {
  return {
    name: input.name,
    slug: input.slug,
    description: input.description ?? null,
    is_active: input.isActive,
    sort_order: input.sortOrder,
  };
}

function auditFromCategory(category: AdminCategory): Record<string, unknown> {
  return {
    name: category.name,
    slug: category.slug,
    description: category.description,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
  };
}

function auditFromInput(input: CategoryInput): Record<string, unknown> {
  return {
    name: input.name,
    slug: input.slug,
    description: input.description ?? null,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
}

/**
 * Spells out what saving this category actually does to the storefront.
 *
 * getActiveProducts() joins categories with `!inner`, so a product in an
 * inactive category disappears from /products even while the product itself is
 * still active. That is surprising enough to state explicitly rather than let
 * an admin discover it by refreshing the public site.
 */
function visibilityMessage(
  isActive: boolean,
  productCount: number,
  activeProductCount: number,
): string {
  if (isActive) {
    if (productCount === 0) {
      return "It is visible, but has no products yet, so it will not appear as a filter on the catalog.";
    }
    return `It is visible, with ${activeProductCount} active ${
      activeProductCount === 1 ? "product" : "products"
    }.`;
  }

  if (activeProductCount === 0) {
    return "It is hidden, so it no longer appears as a catalog filter.";
  }

  return `It is hidden — and because the catalog only shows products whose category is visible, ${activeProductCount} active ${
    activeProductCount === 1 ? "product is" : "products are"
  } now hidden from the storefront too.`;
}

export async function createCategoryAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Authorize.
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  // 2. Validate.
  const parsed = parseForm(categoryInputSchema, formData);
  if (!parsed.success) return parsed.result;
  const input = parsed.data;

  // 3. No "before" state — the row does not exist yet.

  // 4. Write.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .insert(toCategoryRow(input))
    .select("id")
    .single();

  if (error) {
    const duplicate = uniqueViolationResult(error);
    if (duplicate) return duplicate;

    logger.error("createCategoryAction failed", {
      actorId: actor.id,
      slug: input.slug,
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
    entityType: "category",
    entityId: created?.id ?? null,
    before,
    after,
  });

  // 6. Revalidate. Categories drive the catalog filter nav and the homepage
  //    category tiles, so the whole catalog surface is invalidated.
  revalidateCatalog();
  revalidateAdmin(CATEGORIES_PATH);

  // 7. Result. The create form holds no id, so leaving it mounted invites a
  //    duplicate on a second submit — send the admin to the list instead.
  //    redirect() throws, so it is last and never inside a try block.
  redirect(`${CATEGORIES_PATH}?saved=created`);
}

export async function updateCategoryAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(categoryUpdateSchema, formData);
  if (!parsed.success) return parsed.result;
  const input = parsed.data;

  const before = await getCategoryById(input.id);
  if (!before) return actionError(MISSING_ERROR);

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ ...toCategoryRow(input), updated_at: new Date().toISOString() })
    .eq("id", input.id);

  if (error) {
    const duplicate = uniqueViolationResult(error);
    if (duplicate) return duplicate;

    logger.error("updateCategoryAction failed", {
      actorId: actor.id,
      categoryId: input.id,
      error: error.message,
    });
    return actionError(SAVE_ERROR);
  }

  const slugChanged = before.slug !== input.slug;

  const { before: beforeDiff, after: afterDiff } = diffRecords(
    auditFromCategory(before),
    auditFromInput(input),
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: "update",
    entityType: "category",
    entityId: input.id,
    before: beforeDiff,
    after: afterDiff,
    // A slug change breaks existing /products?place=… links, so it is flagged
    // explicitly rather than left buried in the diff.
    metadata: slugChanged
      ? { slugChanged: true, previousSlug: before.slug, newSlug: input.slug }
      : null,
  });

  revalidateCatalog();
  revalidateAdmin(CATEGORIES_PATH);
  revalidateAdmin(`${CATEGORIES_PATH}/${input.id}`);

  const visibility = visibilityMessage(
    input.isActive,
    before.productCount,
    before.activeProductCount,
  );

  return actionSuccess(
    slugChanged
      ? `Category saved. ${visibility} The catalog filter link is now /products?place=${input.slug} — any shared link using "${before.slug}" now falls back to the full catalog.`
      : `Category saved. ${visibility}`,
  );
}

/** Archive = hide. Reversible, and the safe alternative to deleting. */
export async function archiveCategoryAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(categoryIdSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id } = parsed.data;

  const before = await getCategoryById(id);
  if (!before) return actionError(MISSING_ERROR);
  if (!before.isActive) return actionSuccess("That category is already hidden.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.error("archiveCategoryAction failed", {
      actorId: actor.id,
      categoryId: id,
      error: error.message,
    });
    return actionError("Couldn't hide that category. Please try again.");
  }

  const { before: beforeDiff, after: afterDiff } = diffRecords(
    { isActive: true },
    { isActive: false },
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: "archive",
    entityType: "category",
    entityId: id,
    before: beforeDiff,
    after: afterDiff,
    // Hiding a category also hides its products from the catalog. Record the
    // blast radius so the audit trail explains a later "where did my products
    // go?" question.
    metadata:
      before.activeProductCount > 0
        ? { activeProductsHidden: before.activeProductCount }
        : null,
  });

  revalidateCatalog();
  revalidateAdmin(CATEGORIES_PATH);

  return actionSuccess(
    `Category hidden. ${visibilityMessage(false, before.productCount, before.activeProductCount)}`,
  );
}

export async function restoreCategoryAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(categoryIdSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id } = parsed.data;

  const before = await getCategoryById(id);
  if (!before) return actionError(MISSING_ERROR);
  if (before.isActive) return actionSuccess("That category is already visible.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.error("restoreCategoryAction failed", {
      actorId: actor.id,
      categoryId: id,
      error: error.message,
    });
    return actionError("Couldn't restore that category. Please try again.");
  }

  const { before: beforeDiff, after: afterDiff } = diffRecords(
    { isActive: false },
    { isActive: true },
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: "restore",
    entityType: "category",
    entityId: id,
    before: beforeDiff,
    after: afterDiff,
  });

  revalidateCatalog();
  revalidateAdmin(CATEGORIES_PATH);

  return actionSuccess(
    `Category restored. ${visibilityMessage(true, before.productCount, before.activeProductCount)}`,
  );
}

/**
 * Permanent delete, allowed only for a category no product points at.
 *
 * products.category_id is `on delete restrict`, so Postgres is the real
 * guarantee here — the pre-check exists to produce a useful message instead of
 * a foreign-key error, and to avoid attempting a write that cannot succeed.
 * The FK is still relied on for the race where a product is assigned between
 * the check and the delete.
 */
export async function deleteCategoryAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor(DESTRUCTIVE_ROLES);
  if (!actor) return actionError(DELETE_PERMISSION_ERROR);

  const parsed = parseForm(categoryIdSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id } = parsed.data;

  const before = await getCategoryById(id);
  if (!before) return actionError(MISSING_ERROR);

  if (before.productCount > 0) {
    return actionError(
      `"${before.name}" still has ${before.productCount} ${
        before.productCount === 1 ? "product" : "products"
      } assigned to it, so it cannot be deleted. Move those products to another category first, or hide this one instead.`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);

  if (error) {
    // 23503 = foreign key violation: a product was assigned in the meantime.
    if (error.code === "23503") {
      return actionError(
        "A product was assigned to this category just now, so it can no longer be deleted. Reload the page to see the current count.",
      );
    }

    logger.error("deleteCategoryAction failed", {
      actorId: actor.id,
      categoryId: id,
      error: error.message,
    });
    return actionError("Couldn't delete that category. Please try again.");
  }

  // The row is gone, so the audit entry is the only remaining record of what
  // it was. Log the whole thing, not a diff.
  await recordAuditEvent({
    actorId: actor.id,
    action: "delete",
    entityType: "category",
    entityId: id,
    before: auditFromCategory(before),
    after: null,
  });

  revalidateCatalog();
  revalidateAdmin(CATEGORIES_PATH);

  return actionSuccess(`"${before.name}" deleted.`);
}
