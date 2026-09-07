"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedActor } from "@/lib/auth/guard";
import {
  getHeroSlideById,
  type AdminHeroSlide,
} from "@/lib/supabase/queries/admin-hero-slides";
import {
  featuredProductsInputSchema,
  heroSlideIdSchema,
  heroSlideInputSchema,
  type HeroSlideInput,
} from "@/lib/validation/hero-slide";
import { diffRecords, recordAuditEvent } from "@/lib/audit";
import {
  revalidateAdmin,
  revalidateCatalog,
  revalidateHomepage,
} from "@/lib/admin/revalidate";
import { logger } from "@/lib/logger";
import {
  actionError,
  actionSuccess,
  parseForm,
  type ActionResult,
} from "@/lib/admin/action-result";

/**
 * Homepage admin mutations: hero slides and the featured-product flags.
 *
 * Every action follows the order set out in lib/admin/settings/actions.ts —
 * authorize, validate, read "before", write, audit, revalidate, return. The
 * authorization step is repeated inside each action deliberately: a server
 * action is an independently addressable endpoint and the admin layout guard
 * does not cover it (DEVELOPMENT_STANDARDS.md §8).
 *
 * Raw Postgres or exception text is never returned to the browser — it is
 * logged and replaced with a plain sentence (§14).
 */

const ADMIN_HOMEPAGE_PATH = "/admin/homepage";

/** The column values a slide form produces, with the CTA rules applied. */
type HeroSlideRowValues = {
  asset_id: string | null;
  heading: string;
  subheading: string | null;
  cta_label: string | null;
  cta_type: string | null;
  cta_url: string | null;
  is_active: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
};

/**
 * Maps validated input onto columns.
 *
 * "none" becomes NULL (the column is nullable and CHECK-constrained to the
 * three real values), and cta_url is kept only for the 'url' type — a
 * catalogue or product button builds its own href on the storefront, so a
 * stale URL left behind here would be a trap.
 */
function buildSlideRow(input: HeroSlideInput): HeroSlideRowValues {
  const ctaType = input.ctaType === "none" ? null : input.ctaType;

  return {
    asset_id: input.assetId ?? null,
    heading: input.heading,
    subheading: input.subheading ?? null,
    cta_label: ctaType === null ? null : (input.ctaLabel ?? null),
    cta_type: ctaType,
    cta_url: input.ctaType === "url" ? (input.ctaUrl ?? null) : null,
    is_active: input.isActive,
    sort_order: input.sortOrder,
    starts_at: input.startsAt ?? null,
    ends_at: input.endsAt ?? null,
  };
}

/** Audit payload shape, so before/after diffs line up field for field. */
function auditShapeFromRow(row: HeroSlideRowValues) {
  return {
    assetId: row.asset_id,
    heading: row.heading,
    subheading: row.subheading,
    ctaLabel: row.cta_label,
    ctaType: row.cta_type,
    ctaUrl: row.cta_url,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

function auditShapeFromSlide(slide: AdminHeroSlide) {
  return {
    assetId: slide.assetId,
    heading: slide.heading,
    subheading: slide.subheading,
    ctaLabel: slide.ctaLabel,
    ctaType: slide.ctaType,
    ctaUrl: slide.ctaUrl,
    isActive: slide.isActive,
    sortOrder: slide.sortOrder,
    startsAt: slide.startsAt,
    endsAt: slide.endsAt,
  };
}

export async function createHeroSlideAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Authorize.
  const actor = await getAuthorizedActor();
  if (!actor) return actionError("You don't have permission to do that.");

  // 2. Validate.
  const parsed = parseForm(heroSlideInputSchema, formData);
  if (!parsed.success) return parsed.result;

  // 3. No "before" state — the row does not exist yet.
  const row = buildSlideRow(parsed.data);

  // 4. Write through the RLS-enforced client.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hero_slides")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    logger.error("createHeroSlideAction failed", {
      actorId: actor.id,
      error: error.message,
    });
    return actionError("Couldn't create the slide. Please try again.");
  }

  const created = data as { id: string } | null;

  // 5. Audit.
  await recordAuditEvent({
    actorId: actor.id,
    action: "create",
    entityType: "hero_slide",
    entityId: created?.id ?? null,
    before: null,
    after: auditShapeFromRow(row),
  });

  // 6. Revalidate: hero slides render on the homepage.
  revalidateHomepage();
  revalidateAdmin(ADMIN_HOMEPAGE_PATH);

  // 7. Back to the list, where the new slide is now visible. Called outside any
  //    try/catch so the redirect signal is not swallowed.
  redirect(`${ADMIN_HOMEPAGE_PATH}?created=1`);
}

export async function updateHeroSlideAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Authorize.
  const actor = await getAuthorizedActor();
  if (!actor) return actionError("You don't have permission to do that.");

  // 2. Validate — the row id first, then the form body.
  const parsedId = heroSlideIdSchema.safeParse({ id: formData.get("id") });
  if (!parsedId.success) return actionError("That slide could not be found.");

  const parsed = parseForm(heroSlideInputSchema, formData);
  if (!parsed.success) return parsed.result;

  const { id } = parsedId.data;

  // 3. Before state — also confirms the row still exists.
  const before = await getHeroSlideById(id);
  if (!before) return actionError("That slide no longer exists.");

  const row = buildSlideRow(parsed.data);

  // 4. Write.
  const supabase = await createClient();
  const { error } = await supabase
    .from("hero_slides")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.error("updateHeroSlideAction failed", {
      actorId: actor.id,
      slideId: id,
      error: error.message,
    });
    return actionError("Couldn't save the slide. Please try again.");
  }

  // 5. Audit only the fields that actually changed.
  const { before: beforeDiff, after: afterDiff } = diffRecords(
    auditShapeFromSlide(before),
    auditShapeFromRow(row),
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: "update",
    entityType: "hero_slide",
    entityId: id,
    before: beforeDiff,
    after: afterDiff,
  });

  // 6. Revalidate.
  revalidateHomepage();
  revalidateAdmin(ADMIN_HOMEPAGE_PATH);

  // 7. Result.
  return actionSuccess(
    row.is_active
      ? "Slide saved."
      : "Slide saved. It is hidden, so it will not appear on the homepage.",
  );
}

/**
 * Archive = hide. Hero slides are never hard-deleted: an archived slide keeps
 * its history and can be brought back (DATABASE_DESIGN.md §17).
 */
export async function archiveHeroSlideAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return setHeroSlideActive(formData, false);
}

export async function restoreHeroSlideAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return setHeroSlideActive(formData, true);
}

async function setHeroSlideActive(
  formData: FormData,
  isActive: boolean,
): Promise<ActionResult> {
  // 1. Authorize.
  const actor = await getAuthorizedActor();
  if (!actor) return actionError("You don't have permission to do that.");

  // 2. Validate.
  const parsed = parseForm(heroSlideIdSchema, formData);
  if (!parsed.success) return actionError("That slide could not be found.");

  const { id } = parsed.data;

  // 3. Before state.
  const before = await getHeroSlideById(id);
  if (!before) return actionError("That slide no longer exists.");

  if (before.isActive === isActive) {
    return actionSuccess(
      isActive ? "That slide is already visible." : "That slide is already hidden.",
    );
  }

  // 4. Write.
  const supabase = await createClient();
  const { error } = await supabase
    .from("hero_slides")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.error("setHeroSlideActive failed", {
      actorId: actor.id,
      slideId: id,
      isActive,
      error: error.message,
    });
    return actionError(
      isActive
        ? "Couldn't restore the slide. Please try again."
        : "Couldn't hide the slide. Please try again.",
    );
  }

  // 5. Audit.
  await recordAuditEvent({
    actorId: actor.id,
    action: isActive ? "restore" : "archive",
    entityType: "hero_slide",
    entityId: id,
    before: { isActive: before.isActive },
    after: { isActive },
  });

  // 6. Revalidate.
  revalidateHomepage();
  revalidateAdmin(ADMIN_HOMEPAGE_PATH);

  // 7. Result.
  return actionSuccess(
    isActive
      ? "Slide restored. It is visible on the homepage again."
      : "Slide hidden. It no longer appears on the homepage.",
  );
}

type FeaturedRow = { id: string; is_featured: boolean };

/**
 * Saves the featured-product panel.
 *
 * The form posts every product id it displayed plus the subset that is ticked,
 * because HTML omits unchecked boxes — without the full list, an unticked box
 * would be indistinguishable from a product on another page. Only ids that
 * were actually displayed are ever touched.
 */
export async function updateFeaturedProductsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Authorize.
  const actor = await getAuthorizedActor();
  if (!actor) return actionError("You don't have permission to do that.");

  // 2. Validate.
  const parsed = parseForm(featuredProductsInputSchema, formData);
  if (!parsed.success) return parsed.result;

  const candidateIds = [...new Set(parsed.data.productIds)];
  if (candidateIds.length === 0) return actionSuccess("There was nothing to update.");

  const candidateSet = new Set(candidateIds);
  const wanted = new Set(parsed.data.featuredIds.filter((id) => candidateSet.has(id)));

  // 3. Before state.
  const supabase = await createClient();
  const { data, error: readError } = await supabase
    .from("products")
    .select("id, is_featured")
    .in("id", candidateIds);

  if (readError) {
    logger.error("updateFeaturedProductsAction read failed", {
      actorId: actor.id,
      error: readError.message,
    });
    return actionError("Couldn't load those products. Please try again.");
  }

  const rows = (data ?? []) as unknown as FeaturedRow[];
  const changed = rows.filter((row) => row.is_featured !== wanted.has(row.id));

  if (changed.length === 0) return actionSuccess("No changes to save.");

  const toFeature = changed.filter((row) => wanted.has(row.id)).map((row) => row.id);
  const toUnfeature = changed.filter((row) => !wanted.has(row.id)).map((row) => row.id);

  // 4. Write. Two bulk statements rather than one per row, and is_featured is
  //    the only column written — nothing else about a product is touched here.
  if (toFeature.length > 0) {
    const { error } = await supabase
      .from("products")
      .update({ is_featured: true })
      .in("id", toFeature);

    if (error) {
      logger.error("updateFeaturedProductsAction feature failed", {
        actorId: actor.id,
        count: toFeature.length,
        error: error.message,
      });
      return actionError("Couldn't update the featured products. Please try again.");
    }
  }

  if (toUnfeature.length > 0) {
    const { error } = await supabase
      .from("products")
      .update({ is_featured: false })
      .in("id", toUnfeature);

    if (error) {
      logger.error("updateFeaturedProductsAction unfeature failed", {
        actorId: actor.id,
        count: toUnfeature.length,
        error: error.message,
      });
      return actionError(
        toFeature.length > 0
          ? "Some products were updated, but removing the others from Featured failed. Please check the list and try again."
          : "Couldn't update the featured products. Please try again.",
      );
    }
  }

  // 5. Audit — one entry per product, so a single product's history reads
  //    correctly rather than being buried inside a batch record.
  await Promise.all(
    changed.map((row) =>
      recordAuditEvent({
        actorId: actor.id,
        action: "update",
        entityType: "product",
        entityId: row.id,
        before: { isFeatured: row.is_featured },
        after: { isFeatured: wanted.has(row.id) },
        metadata: { field: "is_featured", source: "homepage_admin" },
      }),
    ),
  );

  // 6. Featured products render on the homepage and are flagged across the
  //    catalogue, so both are invalidated.
  revalidateHomepage();
  revalidateCatalog();
  revalidateAdmin(ADMIN_HOMEPAGE_PATH);

  // 7. Result.
  return actionSuccess(
    changed.length === 1 ? "1 product updated." : `${changed.length} products updated.`,
  );
}
