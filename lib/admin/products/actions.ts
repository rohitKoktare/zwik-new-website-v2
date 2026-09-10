"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedActor } from "@/lib/auth/guard";
import {
  getAdminProductById,
  toProductAuditRecord,
} from "@/lib/supabase/queries/admin-products";
import {
  productIdSchema,
  productInputSchema,
  productUpdateSchema,
  type ProductInput,
} from "@/lib/validation/product";
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
 * Admin product mutations. Every action follows the order set by
 * lib/admin/settings/actions.ts:
 *
 *   1. Authorize (independently of the layout guard)
 *   2. Validate with Zod
 *   3. Read the "before" state for the audit trail
 *   4. Write through the RLS-enforced client
 *   5. Audit
 *   6. Revalidate the affected public pages
 *   7. Return a safe, human-readable result
 *
 * There is no hard delete here: products are archived (is_active = false) so a
 * mistake is recoverable and nothing referencing them breaks
 * (DATABASE_DESIGN.md §17).
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** The parts of a PostgREST error this module is allowed to look at. */
type WriteError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

const ADMIN_LIST_PATH = "/admin/products";

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
      slug: ["That slug is already in use. Try a different one."],
    });
  }

  if (constraint.includes("sku")) {
    return validationError({
      sku: ["That SKU is already in use by another product."],
    });
  }

  return actionError(
    "Another product already uses one of these unique values. Change the slug or SKU and try again.",
  );
}

/** Maps validated form input onto the `products` column names. */
function toProductRow(input: ProductInput) {
  return {
    name: input.name,
    slug: input.slug,
    sku: input.sku ?? null,
    short_description: input.shortDescription ?? null,
    description: input.description ?? null,
    features: input.specs,
    price: input.price,
    original_price: input.originalPrice ?? null,
    currency: input.currency,
    is_featured: input.isFeatured,
    is_active: input.isActive,
    sort_order: input.sortOrder,
  };
}

/** The same fields in the camelCase shape the audit trail records. */
function toAuditRecord(
  input: ProductInput,
  assetIds: string[],
  categoryIds: string[],
): Record<string, unknown> {
  return {
    name: input.name,
    slug: input.slug,
    sku: input.sku ?? null,
    shortDescription: input.shortDescription ?? null,
    description: input.description ?? null,
    specs: input.specs,
    categoryIds,
    price: input.price,
    originalPrice: input.originalPrice ?? null,
    currency: input.currency,
    isFeatured: input.isFeatured,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
    assetIds,
    videoAssetId: input.videoAssetId ?? null,
  };
}

/**
 * Replaces a product's gallery links. `product_assets` is keyed on
 * (product_id, asset_id) and carries the ordering, so a full replace is both
 * simpler and more predictable than a per-row reconciliation.
 *
 * Supabase gives no client-side transaction, so a failure between the delete
 * and the insert would leave the gallery empty. That is reported back to the
 * caller rather than swallowed.
 */
async function syncProductAssets(
  supabase: SupabaseServerClient,
  productId: string,
  assetIds: string[],
  videoAssetId?: string,
): Promise<boolean> {
  const { error: deleteError } = await supabase
    .from("product_assets")
    .delete()
    .eq("product_id", productId);

  if (deleteError) {
    logger.error("syncProductAssets delete failed", {
      productId,
      error: deleteError.message,
    });
    return false;
  }

  /**
   * The gallery and the video share this join table, separated by `role`.
   * A single asset cannot hold both roles — (product_id, asset_id) is the
   * primary key — so the video is dropped from the gallery list rather than
   * inserted twice, which would fail the whole write.
   */
  const galleryIds = videoAssetId
    ? assetIds.filter((id) => id !== videoAssetId)
    : assetIds;

  const rows: {
    product_id: string;
    asset_id: string;
    role: string;
    sort_order: number;
  }[] = galleryIds.map((assetId, index) => ({
    product_id: productId,
    asset_id: assetId,
    // The first image is the one the storefront leads with.
    role: index === 0 ? "main" : "gallery",
    sort_order: index,
  }));

  if (videoAssetId) {
    rows.push({
      product_id: productId,
      asset_id: videoAssetId,
      role: "video",
      // Sorted after the gallery so it never displaces the lead image.
      sort_order: galleryIds.length,
    });
  }

  if (rows.length === 0) return true;

  const { error: insertError } = await supabase.from("product_assets").insert(rows);

  if (insertError) {
    logger.error("syncProductAssets insert failed", {
      productId,
      count: rows.length,
      error: insertError.message,
    });
    return false;
  }

  return true;
}

/**
 * Replaces a product's category assignments. Same delete-then-insert shape as
 * syncProductAssets, for the same reason: `product_categories` is keyed on
 * (product_id, category_id), so a full replace is simpler and more predictable
 * than reconciling individual rows — and there's no per-row ordering or role
 * to preserve here the way the gallery has.
 *
 * Unlike a failed gallery write, a product left with zero categories is worse
 * than cosmetic: the storefront catalogue joins through this table, so it
 * would silently stop appearing anywhere on the public site. Still reported
 * back rather than rolled back — Supabase gives no client-side transaction,
 * and the product row itself already committed by the time this runs.
 */
async function syncProductCategories(
  supabase: SupabaseServerClient,
  productId: string,
  categoryIds: string[],
): Promise<boolean> {
  const { error: deleteError } = await supabase
    .from("product_categories")
    .delete()
    .eq("product_id", productId);

  if (deleteError) {
    logger.error("syncProductCategories delete failed", {
      productId,
      error: deleteError.message,
    });
    return false;
  }

  if (categoryIds.length === 0) return true;

  const { error: insertError } = await supabase.from("product_categories").insert(
    categoryIds.map((categoryId) => ({ product_id: productId, category_id: categoryId })),
  );

  if (insertError) {
    logger.error("syncProductCategories insert failed", {
      productId,
      count: categoryIds.length,
      error: insertError.message,
    });
    return false;
  }

  return true;
}

export async function createProductAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Authorize.
  const actor = await getAuthorizedActor();
  if (!actor) return actionError("You don't have permission to do that.");

  // 2. Validate.
  const parsed = parseForm(productInputSchema, formData);
  if (!parsed.success) return parsed.result;
  const input = parsed.data;

  // 3. No "before" state — the row does not exist yet.

  // 4. Write.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert(toProductRow(input))
    .select("id")
    .single();

  if (error) {
    const duplicate = uniqueViolationResult(error);
    if (duplicate) return duplicate;

    logger.error("createProductAction failed", {
      actorId: actor.id,
      slug: input.slug,
      error: error.message,
    });
    return actionError("Couldn't create that product. Please try again.");
  }

  const productId = (data as { id: string }).id;
  const galleryOk = await syncProductAssets(supabase, productId, input.assetIds, input.videoAssetId);
  const categoriesOk = await syncProductCategories(supabase, productId, input.categoryIds);

  // 5. Audit.
  const { before, after } = diffRecords(
    null,
    toAuditRecord(
      input,
      galleryOk ? input.assetIds : [],
      categoriesOk ? input.categoryIds : [],
    ),
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: "create",
    entityType: "product",
    entityId: productId,
    before,
    after,
    metadata:
      galleryOk && categoriesOk
        ? null
        : { galleryWriteFailed: !galleryOk, categoriesWriteFailed: !categoriesOk },
  });

  // 6. Revalidate the public pages this product appears on.
  revalidateCatalog(input.slug);
  revalidateAdmin(ADMIN_LIST_PATH);

  // 7. Continue on the edit screen, so the admin keeps working on the row they
  //    just created instead of re-submitting the create form.
  const params = new URLSearchParams({ created: "1" });
  if (!galleryOk) params.set("mediaError", "1");
  if (!categoriesOk) params.set("categoryError", "1");
  redirect(`${ADMIN_LIST_PATH}/${productId}?${params.toString()}`);
}

export async function updateProductAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Authorize.
  const actor = await getAuthorizedActor();
  if (!actor) return actionError("You don't have permission to do that.");

  // 2. Validate.
  const parsed = parseForm(productUpdateSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id, ...input } = parsed.data;

  // 3. Before state.
  const before = await getAdminProductById(id);
  if (!before) {
    return actionError("We couldn't find that product. It may have been removed.");
  }

  // 4. Write.
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ ...toProductRow(input), updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    const duplicate = uniqueViolationResult(error);
    if (duplicate) return duplicate;

    logger.error("updateProductAction failed", {
      actorId: actor.id,
      productId: id,
      error: error.message,
    });
    return actionError("Couldn't save that product. Please try again.");
  }

  const galleryOk = await syncProductAssets(supabase, id, input.assetIds, input.videoAssetId);
  const categoriesOk = await syncProductCategories(supabase, id, input.categoryIds);

  // 5. Audit — only the fields that actually changed.
  const { before: beforeDiff, after: afterDiff } = diffRecords(
    toProductAuditRecord(before),
    toAuditRecord(
      input,
      galleryOk ? input.assetIds : before.assetIds,
      categoriesOk ? input.categoryIds : before.categoryIds,
    ),
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: "update",
    entityType: "product",
    entityId: id,
    before: beforeDiff,
    after: afterDiff,
    metadata:
      galleryOk && categoriesOk
        ? null
        : { galleryWriteFailed: !galleryOk, categoriesWriteFailed: !categoriesOk },
  });

  // 6. Revalidate. A renamed slug means the old URL has to be refreshed too,
  //    or the previous page stays cached and live.
  revalidateCatalog(input.slug);
  if (before.slug !== input.slug) revalidateCatalog(before.slug);
  revalidateAdmin(ADMIN_LIST_PATH);
  revalidateAdmin(`${ADMIN_LIST_PATH}/${id}`);

  // 7. Result.
  if (!galleryOk && !categoriesOk) {
    return actionError(
      "The product details were saved, but the gallery and categories could not be updated. Please set them again.",
    );
  }
  if (!categoriesOk) {
    return actionError(
      "The product details were saved, but its categories could not be updated — it may now be invisible on the public site. Please choose its categories again.",
    );
  }
  if (!galleryOk) {
    return actionError(
      "The product details were saved, but the image gallery could not be updated. Please set the images again.",
    );
  }

  return actionSuccess(
    input.isActive
      ? "Product saved."
      : "Product saved. It is archived, so it stays hidden from the public site.",
  );
}

/** Shared body for archive/restore — they differ only in the flag they set. */
async function setProductActive(
  formData: FormData,
  isActive: boolean,
): Promise<ActionResult> {
  // 1. Authorize. Archiving is recoverable, so it is not restricted to
  //    DESTRUCTIVE_ROLES the way a permanent delete would be.
  const actor = await getAuthorizedActor();
  if (!actor) return actionError("You don't have permission to do that.");

  // 2. Validate.
  const parsed = parseForm(productIdSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id } = parsed.data;

  // 3. Before state.
  const before = await getAdminProductById(id);
  if (!before) {
    return actionError("We couldn't find that product. It may have been removed.");
  }

  if (before.isActive === isActive) {
    return actionSuccess(
      isActive ? "That product is already live." : "That product is already archived.",
    );
  }

  // 4. Write.
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.error("setProductActive failed", {
      actorId: actor.id,
      productId: id,
      isActive,
      error: error.message,
    });
    return actionError(
      isActive
        ? "Couldn't restore that product. Please try again."
        : "Couldn't archive that product. Please try again.",
    );
  }

  // 5. Audit.
  const { before: beforeDiff, after: afterDiff } = diffRecords(
    { isActive: before.isActive },
    { isActive },
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: isActive ? "restore" : "archive",
    entityType: "product",
    entityId: id,
    before: beforeDiff,
    after: afterDiff,
    metadata: { name: before.name, slug: before.slug },
  });

  // 6. Revalidate.
  revalidateCatalog(before.slug);
  revalidateAdmin(ADMIN_LIST_PATH);
  revalidateAdmin(`${ADMIN_LIST_PATH}/${id}`);

  // 7. Result.
  return actionSuccess(
    isActive
      ? `${before.name} is live again.`
      : `${before.name} is archived and no longer visible on the site.`,
  );
}

export async function archiveProductAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return setProductActive(formData, false);
}

export async function restoreProductAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return setProductActive(formData, true);
}
