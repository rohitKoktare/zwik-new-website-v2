"use server";

import { createClient } from "@/lib/supabase/server";
import { DESTRUCTIVE_ROLES, getAuthorizedActor } from "@/lib/auth/guard";
import {
  countAssetReferences,
  getAssetById,
} from "@/lib/supabase/queries/admin-assets";
import {
  ALLOWED_TYPES_LABEL,
  ALLOWED_UPLOAD_TYPES,
  assetAltTextSchema,
  assetIdSchema,
  assetUploadSchema,
  describeAssetReferences,
  fileExtension,
  isAllowedMimeType,
  matchesDeclaredSignature,
  safeDisplayFilename,
  SIGNATURE_HEADER_BYTES,
} from "@/lib/validation/asset";
import { buildStorageKey, MEDIA_BUCKET } from "@/lib/storage/resolve-asset-url";
import { diffRecords, recordAuditEvent } from "@/lib/audit";
import { revalidateCatalog } from "@/lib/admin/revalidate";
import { logger } from "@/lib/logger";
import {
  actionError,
  actionSuccess,
  parseForm,
  validationError,
  type ActionResult,
} from "@/lib/admin/action-result";

/**
 * Media library mutations.
 *
 * Every action re-authorizes independently: a server action is its own
 * addressable endpoint, so the admin layout's guard protects nothing here
 * (DEVELOPMENT_STANDARDS.md §8). Storage and exception text never reach the
 * browser — it is logged and a friendly sentence is returned (§14).
 */

/**
 * Uploads a file to Supabase Storage and records it in `assets`.
 *
 * The whole point of this action is that nothing the browser says about the
 * file is believed:
 *   - the declared MIME type must be on the allowlist,
 *   - the extension must be one this type is allowed to use,
 *   - the leading bytes must actually look like that format,
 *   - the object key is generated server-side, never taken from the filename.
 *
 * Storage enforces its own size/MIME limits on top (migration 0010), so a
 * mistake here still cannot store an arbitrary binary.
 */
export async function uploadAssetAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Authorize.
  const actor = await getAuthorizedActor();
  if (!actor) return actionError("You don't have permission to upload media.");

  // 2. Validate the form values (presence, size, folder, advisory dimensions).
  const parsed = parseForm(assetUploadSchema, formData);
  if (!parsed.success) return parsed.result;
  const { file, folder, altText, width, height } = parsed.data;

  // 3. Allowlist the declared type, then the extension it is allowed to carry.
  //    Both are client-supplied — this narrows what we then have to verify.
  const declaredMime = file.type.split(";")[0].trim().toLowerCase();

  if (!isAllowedMimeType(declaredMime)) {
    return validationError({
      file: [`That file type isn't supported. Upload a ${ALLOWED_TYPES_LABEL} file.`],
    });
  }

  const spec = ALLOWED_UPLOAD_TYPES[declaredMime];
  const extension = fileExtension(file.name);

  if (!(spec.extensions as readonly string[]).includes(extension)) {
    return validationError({
      file: [
        `A ${declaredMime} file must be named ${spec.extensions.join(" or ")}. Rename it and try again.`,
      ],
    });
  }

  // 4. Verify the bytes. Only the header is read — enough to identify the
  //    container, without pulling a second copy of a 25 MB file into memory.
  let header: Uint8Array;
  try {
    header = new Uint8Array(await file.slice(0, SIGNATURE_HEADER_BYTES).arrayBuffer());
  } catch (cause) {
    logger.error("Could not read upload for signature check", {
      actorId: actor.id,
      reason: cause instanceof Error ? cause.message : "unknown",
    });
    return actionError("Couldn't read that file. Please try again.");
  }

  if (!matchesDeclaredSignature(declaredMime, header)) {
    // Worth a log line: a genuine mismatch is either a corrupt file or an
    // attempt to smuggle one type in under another's name.
    logger.warn("Rejected upload: contents do not match declared type", {
      actorId: actor.id,
      declaredMime,
      extension,
      fileSizeBytes: file.size,
    });
    return validationError({
      file: [
        "That file's contents don't match its type. It may be corrupted or renamed — re-export it and try again.",
      ],
    });
  }

  // 5. Generate the object key. The client filename is display metadata only.
  const storagePath = buildStorageKey(folder, file.name);
  const filename = safeDisplayFilename(file.name);
  const supabase = await createClient();

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, file, {
      contentType: declaredMime,
      upsert: false,
      // Keys are unique per upload, so an object is never replaced in place
      // and can be cached indefinitely.
      cacheControl: "31536000",
    });

  if (uploadError) {
    logger.error("Asset upload to storage failed", {
      actorId: actor.id,
      storagePath,
      error: uploadError.message,
    });
    return actionError("Couldn't upload that file. Please try again.");
  }

  // 6. Record it. If this fails the object is already in Storage, so remove it
  //    again — otherwise the bucket accumulates files no screen can see.
  const { data: inserted, error: insertError } = await supabase
    .from("assets")
    .insert({
      filename,
      storage_bucket: MEDIA_BUCKET,
      storage_path: storagePath,
      media_type: spec.mediaType,
      mime_type: declaredMime,
      width: width ?? null,
      height: height ?? null,
      file_size_bytes: file.size,
      alt_text: altText ?? null,
      status: "active",
      created_by: actor.id,
    })
    .select("id")
    .single();

  const insertedId = (inserted as { id: string } | null)?.id ?? null;

  if (insertError || !insertedId) {
    const { error: cleanupError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .remove([storagePath]);

    if (cleanupError) {
      // Storage and the database have drifted. Loud, because only a human can
      // reconcile it now.
      logger.error("Orphaned storage object after failed asset insert", {
        actorId: actor.id,
        storagePath,
        error: cleanupError.message,
      });
    }

    logger.error("Asset insert failed", {
      actorId: actor.id,
      storagePath,
      error: insertError?.message ?? "insert returned no row",
    });
    return actionError("Couldn't save that file's details, so the upload was undone. Please try again.");
  }

  // 7. Audit.
  await recordAuditEvent({
    actorId: actor.id,
    action: "upload",
    entityType: "asset",
    entityId: insertedId,
    after: {
      filename,
      storagePath,
      mediaType: spec.mediaType,
      mimeType: declaredMime,
      fileSizeBytes: file.size,
      width: width ?? null,
      height: height ?? null,
      altText: altText ?? null,
    },
    metadata: { folder },
  });

  // 8. Uploaded media can appear on product pages and the homepage.
  revalidateCatalog();

  return actionSuccess(
    altText
      ? `Uploaded ${filename}.`
      : `Uploaded ${filename}. Add alt text so it reads well for screen readers and search.`,
  );
}

/** Updates alt text. Small edit, but it is the accessibility/SEO text itself. */
export async function updateAssetAltTextAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError("You don't have permission to edit media.");

  const parsed = parseForm(assetAltTextSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id, altText } = parsed.data;

  const before = await getAssetById(id);
  if (!before) return actionError("That file no longer exists. Refresh and try again.");

  const nextAltText = altText ?? null;
  if (before.altText === nextAltText) {
    return actionSuccess("Alt text is already up to date.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("assets")
    .update({ alt_text: nextAltText, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.error("updateAssetAltTextAction failed", {
      actorId: actor.id,
      assetId: id,
      error: error.message,
    });
    return actionError("Couldn't save the alt text. Please try again.");
  }

  const { before: beforeDiff, after: afterDiff } = diffRecords(
    { altText: before.altText },
    { altText: nextAltText },
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: "update",
    entityType: "asset",
    entityId: id,
    before: beforeDiff,
    after: afterDiff,
  });

  // Alt text is rendered on the storefront.
  revalidateCatalog();

  return actionSuccess(nextAltText ? "Alt text saved." : "Alt text cleared.");
}

/**
 * Archives an asset. Reversible, so any admin may do it — but an archived
 * asset stays attached to whatever already uses it, which is why the caller is
 * shown the reference count before confirming.
 */
export async function archiveAssetAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError("You don't have permission to archive media.");

  const parsed = parseForm(assetIdSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id } = parsed.data;

  const before = await getAssetById(id);
  if (!before) return actionError("That file no longer exists. Refresh and try again.");
  if (before.status === "archived") return actionSuccess("That file is already archived.");

  // Counted again here rather than trusting whatever the page rendered.
  const references = await countAssetReferences(id);

  const supabase = await createClient();
  const { error } = await supabase
    .from("assets")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.error("archiveAssetAction failed", {
      actorId: actor.id,
      assetId: id,
      error: error.message,
    });
    return actionError("Couldn't archive that file. Please try again.");
  }

  await recordAuditEvent({
    actorId: actor.id,
    action: "archive",
    entityType: "asset",
    entityId: id,
    before: { status: before.status },
    after: { status: "archived" },
    metadata: { filename: before.filename, references },
  });

  revalidateCatalog();

  return actionSuccess(
    references.total > 0
      ? `Archived ${before.filename}. It is still used by ${describeAssetReferences(references)}, so it keeps showing there until you swap it out.`
      : `Archived ${before.filename}.`,
  );
}

/** Puts an archived asset back into circulation. */
export async function restoreAssetAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError("You don't have permission to restore media.");

  const parsed = parseForm(assetIdSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id } = parsed.data;

  const before = await getAssetById(id);
  if (!before) return actionError("That file no longer exists. Refresh and try again.");
  if (before.status === "active") return actionSuccess("That file is already active.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("assets")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logger.error("restoreAssetAction failed", {
      actorId: actor.id,
      assetId: id,
      error: error.message,
    });
    return actionError("Couldn't restore that file. Please try again.");
  }

  await recordAuditEvent({
    actorId: actor.id,
    action: "restore",
    entityType: "asset",
    entityId: id,
    before: { status: before.status },
    after: { status: "active" },
    metadata: { filename: before.filename },
  });

  revalidateCatalog();

  return actionSuccess(`Restored ${before.filename}.`);
}

/**
 * Permanently deletes an asset — bytes and row.
 *
 * Guarded three ways: the actor must hold a destructive role, nothing may
 * reference the asset, and the foreign keys from product_assets, hero_slides
 * and reviews would refuse the delete anyway. Storage goes first so a failure
 * there leaves a still-usable asset rather than a row pointing at nothing.
 */
export async function deleteAssetAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor(DESTRUCTIVE_ROLES);
  if (!actor) {
    return actionError("You don't have permission to permanently delete media.");
  }

  const parsed = parseForm(assetIdSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id } = parsed.data;

  const asset = await getAssetById(id);
  if (!asset) return actionError("That file no longer exists. Refresh and try again.");

  const references = await countAssetReferences(id);
  if (references.total > 0) {
    return actionError(
      `${asset.filename} is still used by ${describeAssetReferences(references)}. Remove it there first, or archive it instead.`,
    );
  }

  const supabase = await createClient();

  const { error: storageError } = await supabase.storage
    .from(asset.storageBucket)
    .remove([asset.storagePath]);

  if (storageError) {
    logger.error("Asset storage delete failed", {
      actorId: actor.id,
      assetId: id,
      storagePath: asset.storagePath,
      error: storageError.message,
    });
    return actionError("Couldn't remove the stored file, so nothing was deleted. Please try again.");
  }

  const { error: deleteError } = await supabase.from("assets").delete().eq("id", id);

  if (deleteError) {
    // The bytes are gone but the row survived — anything still rendering this
    // asset now points at a missing file, so this needs a human.
    logger.error("Asset row delete failed after storage delete", {
      actorId: actor.id,
      assetId: id,
      storagePath: asset.storagePath,
      error: deleteError.message,
    });
    return actionError(
      "The stored file was removed but its record couldn't be deleted. Please try again.",
    );
  }

  await recordAuditEvent({
    actorId: actor.id,
    action: "delete",
    entityType: "asset",
    entityId: id,
    before: {
      filename: asset.filename,
      storagePath: asset.storagePath,
      mediaType: asset.mediaType,
      mimeType: asset.mimeType,
      fileSizeBytes: asset.fileSizeBytes,
      altText: asset.altText,
      status: asset.status,
    },
  });

  revalidateCatalog();

  return actionSuccess(`Deleted ${asset.filename} permanently.`);
}
