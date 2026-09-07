"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthorizedActor, SETTINGS_ROLES } from "@/lib/auth/guard";
import { getSettingsForAdmin } from "@/lib/supabase/queries/admin-settings";
import { settingsInputSchema } from "@/lib/validation/settings";
import { diffRecords, recordAuditEvent } from "@/lib/audit";
import { revalidateSiteWide } from "@/lib/admin/revalidate";
import { logger } from "@/lib/logger";
import {
  actionError,
  actionSuccess,
  parseForm,
  type ActionResult,
} from "@/lib/admin/action-result";

/**
 * Reference implementation for admin mutations. Every admin action follows
 * this order:
 *
 *   1. Authorize (server-side, independent of any layout guard)
 *   2. Validate input with Zod
 *   3. Read the "before" state for the audit trail
 *   4. Write
 *   5. Audit
 *   6. Revalidate affected public pages
 *   7. Return a safe, human-readable result
 *
 * Database/exception text never reaches the browser — it is logged instead
 * (DEVELOPMENT_STANDARDS.md §14).
 */
export async function updateSettingsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Authorize. Settings changes can take ordering offline, so they are
  //    restricted beyond plain admin access.
  const actor = await getAuthorizedActor(SETTINGS_ROLES);
  if (!actor) {
    return actionError("You don't have permission to change site settings.");
  }

  // 2. Validate.
  const parsed = parseForm(settingsInputSchema, formData);
  if (!parsed.success) return parsed.result;
  const input = parsed.data;

  // 3. Before state.
  const before = await getSettingsForAdmin();

  const row = {
    brand_name: input.brandName,
    whatsapp_enabled: input.whatsappEnabled,
    whatsapp_number: input.whatsappNumber ?? null,
    whatsapp_default_message: input.whatsappDefaultMessage ?? null,
    instagram_url: input.instagramUrl ?? null,
    contact_email: input.contactEmail ?? null,
    default_seo_title: input.defaultSeoTitle ?? null,
    default_seo_description: input.defaultSeoDescription ?? null,
    updated_by: actor.id,
    updated_at: new Date().toISOString(),
    // Only sent when migration 0011 is applied. Including these columns
    // against an older schema would fail the whole write and take the
    // WhatsApp number down with it.
    ...(before.deliveryMigrationPending
      ? {}
      : {
          free_delivery_threshold: input.freeDeliveryThreshold ?? null,
          delivery_scope_note: input.deliveryScopeNote ?? null,
          delivery_fee: input.deliveryFee ?? null,
        }),
  };

  // 4. Write. site_settings is a singleton enforced by a unique index, so this
  //    is an insert on first save and an update thereafter.
  const supabase = await createClient();
  const { error } = before.id
    ? await supabase.from("site_settings").update(row).eq("id", before.id)
    : await supabase.from("site_settings").insert(row);

  if (error) {
    logger.error("updateSettingsAction failed", {
      actorId: actor.id,
      error: error.message,
    });
    return actionError("Couldn't save settings. Please try again.");
  }

  // 5. Audit — record only what changed.
  const { before: beforeDiff, after: afterDiff } = diffRecords(
    {
      brandName: before.brandName,
      whatsappEnabled: before.whatsappEnabled,
      whatsappNumber: before.whatsappNumber,
      whatsappDefaultMessage: before.whatsappDefaultMessage,
      instagramUrl: before.instagramUrl,
      contactEmail: before.contactEmail,
      defaultSeoTitle: before.defaultSeoTitle,
      defaultSeoDescription: before.defaultSeoDescription,
      freeDeliveryThreshold: before.freeDeliveryThreshold,
      deliveryScopeNote: before.deliveryScopeNote,
      deliveryFee: before.deliveryFee,
    },
    {
      brandName: input.brandName,
      whatsappEnabled: input.whatsappEnabled,
      whatsappNumber: input.whatsappNumber ?? null,
      whatsappDefaultMessage: input.whatsappDefaultMessage ?? null,
      instagramUrl: input.instagramUrl ?? null,
      contactEmail: input.contactEmail ?? null,
      defaultSeoTitle: input.defaultSeoTitle ?? null,
      defaultSeoDescription: input.defaultSeoDescription ?? null,
      freeDeliveryThreshold: before.deliveryMigrationPending
        ? before.freeDeliveryThreshold
        : (input.freeDeliveryThreshold ?? null),
      deliveryScopeNote: before.deliveryMigrationPending
        ? before.deliveryScopeNote
        : (input.deliveryScopeNote ?? null),
      deliveryFee: before.deliveryMigrationPending
        ? before.deliveryFee
        : (input.deliveryFee ?? null),
    },
  );

  const orderingWentOffline =
    (before.whatsappEnabled && !input.whatsappEnabled) ||
    (before.whatsappNumber !== (input.whatsappNumber ?? null) && before.whatsappNumber !== null);

  await recordAuditEvent({
    actorId: actor.id,
    action: before.id ? "update" : "create",
    entityType: "site_settings",
    entityId: before.id,
    before: beforeDiff,
    after: afterDiff,
    metadata: orderingWentOffline ? { orderingImpact: true } : null,
  });

  // 6. Settings feed the header, footer and every WhatsApp link, so the whole
  //    layout is invalidated rather than a single page.
  revalidateSiteWide();

  // 7. Result. Never claim the delivery terms were saved when the columns to
  //    store them do not exist yet.
  const deliveryNote =
    before.deliveryMigrationPending &&
    (input.freeDeliveryThreshold !== undefined || input.deliveryFee !== undefined)
      ? " The delivery terms were NOT saved — apply supabase/migrations/0011_delivery_settings.sql first."
      : "";

  return actionSuccess(
    (input.whatsappEnabled
      ? "Settings saved."
      : "Settings saved. WhatsApp ordering is now OFF — customers cannot place orders.") +
      deliveryNote,
  );
}
