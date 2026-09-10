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
  type AssetUploadInput,
} from "@/lib/validation/asset";
import { buildStorageKey, MEDIA_BUCKET } from "@/lib/storage/resolve-asset-url";
import { diffRecords, recordAuditEvent } from "@/lib/audit";
import { revalidateCatalog } from "@/lib/admin/revalidate";
import { logger } from "@/lib/logger";
import {
  actionError,
  actionSuccess,
  parseForm,
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

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type SingleUploadResult =
  | { ok: true; id: string; filename: string }
  | { ok: false; filename: string; reason: string };

/**
 * Uploads one file to Supabase Storage and records it in `assets`. The
 * per-file body of `uploadAssetsAction` below — pulled out on its own so a
 * batch of many can call it in a loop without duplicating the verification
 * chain for each one.
 *
 * The whole point of this function is that nothing the browser says about the
 * file is believed:
 *   - the declared MIME type must be on the allowlist,
 *   - the extension must be one this type is allowed to use,
 *   - the leading bytes must actually look like that format,
 *   - the object key is generated server-side, never taken from the filename.
 *
 * Storage enforces its own size/MIME limits on top (migration 0010), so a
 * mistake here still cannot store an arbitrary binary.
 */
async function uploadSingleAsset(
  supabase: SupabaseServerClient,
  actorId: string,
  file: File,
  folder: AssetUploadInput["folder"],
  altText: string | undefined,
  width: number | undefined,
  height: number | undefined,
): Promise<SingleUploadResult> {
  const displayName = safeDisplayFilename(file.name);

  // Allowlist the declared type, then the extension it is allowed to carry.
  // Both are client-supplied — this narrows what we then have to verify.
  const declaredMime = file.type.split(";")[0].trim().toLowerCase();

  if (!isAllowedMimeType(declaredMime)) {
    return {
      ok: false,
      filename: displayName,
      reason: `That file type isn't supported. Upload a ${ALLOWED_TYPES_LABEL} file.`,
    };
  }

  const spec = ALLOWED_UPLOAD_TYPES[declaredMime];
  const extension = fileExtension(file.name);

  if (!(spec.extensions as readonly string[]).includes(extension)) {
    return {
      ok: false,
      filename: displayName,
      reason: `A ${declaredMime} file must be named ${spec.extensions.join(" or ")}.`,
    };
  }

  // Verify the bytes. Only the header is read — enough to identify the
  // container, without pulling a second copy of a 25 MB file into memory.
  let header: Uint8Array;
  try {
    header = new Uint8Array(await file.slice(0, SIGNATURE_HEADER_BYTES).arrayBuffer());
  } catch (cause) {
    logger.error("Could not read upload for signature check", {
      actorId,
      reason: cause instanceof Error ? cause.message : "unknown",
    });
    return { ok: false, filename: displayName, reason: "Couldn't read that file." };
  }

  if (!matchesDeclaredSignature(declaredMime, header)) {
    // Worth a log line: a genuine mismatch is either a corrupt file or an
    // attempt to smuggle one type in under another's name.
    logger.warn("Rejected upload: contents do not match declared type", {
      actorId,
      declaredMime,
      extension,
      fileSizeBytes: file.size,
    });
    return {
      ok: false,
      filename: displayName,
      reason: "Its contents don't match its type. It may be corrupted or renamed.",
    };
  }

  // Generate the object key. The client filename is display metadata only.
  const storagePath = buildStorageKey(folder, file.name);

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
      actorId,
      storagePath,
      error: uploadError.message,
    });
    return { ok: false, filename: displayName, reason: "Couldn't upload that file." };
  }

  // Record it. If this fails the object is already in Storage, so remove it
  // again — otherwise the bucket accumulates files no screen can see.
  const { data: inserted, error: insertError } = await supabase
    .from("assets")
    .insert({
      filename: displayName,
      storage_bucket: MEDIA_BUCKET,
      storage_path: storagePath,
      media_type: spec.mediaType,
      mime_type: declaredMime,
      width: width ?? null,
      height: height ?? null,
      file_size_bytes: file.size,
      alt_text: altText ?? null,
      status: "active",
      created_by: actorId,
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
        actorId,
        storagePath,
        error: cleanupError.message,
      });
    }

    logger.error("Asset insert failed", {
      actorId,
      storagePath,
      error: insertError?.message ?? "insert returned no row",
    });
    return {
      ok: false,
      filename: displayName,
      reason: "Couldn't save its details, so the upload was undone.",
    };
  }

  await recordAuditEvent({
    actorId,
    action: "upload",
    entityType: "asset",
    entityId: insertedId,
    after: {
      filename: displayName,
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

  return { ok: true, id: insertedId, filename: displayName };
}

/**
 * Uploads one or many files in a single admin action — the file picker always
 * posts an array, even for a single selection (see assetUploadSchema).
 * `widths`/`heights` are index-aligned with `files`, not matched by any id.
 *
 * Runs sequentially rather than in parallel: several 25 MB uploads at once
 * would spike a serverless function's memory well beyond what one file needs,
 * for an admin-only, low-frequency action where a few extra seconds is a
 * reasonable trade.
 */
export async function uploadAssetsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Authorize.
  const actor = await getAuthorizedActor();
  if (!actor) return actionError("You don't have permission to upload media.");

  // 2. Validate the form values (presence, size, folder, advisory dimensions).
  const parsed = parseForm(assetUploadSchema, formData);
  if (!parsed.success) return parsed.result;
  const { files, folder, altText, widths, heights } = parsed.data;

  const supabase = await createClient();
  const results: SingleUploadResult[] = [];

  for (let i = 0; i < files.length; i++) {
    results.push(
      await uploadSingleAsset(supabase, actor.id, files[i], folder, altText, widths[i], heights[i]),
    );
  }

  const succeeded = results.filter((r): r is Extract<SingleUploadResult, { ok: true }> => r.ok);
  const failed = results.filter((r): r is Extract<SingleUploadResult, { ok: false }> => !r.ok);

  // Any successful upload can appear on product pages and the homepage.
  if (succeeded.length > 0) revalidateCatalog();

  if (failed.length === 0) {
    return actionSuccess(
      succeeded.length === 1
        ? altText
          ? `Uploaded ${succeeded[0].filename}.`
          : `Uploaded ${succeeded[0].filename}. Add alt text so it reads well for screen readers and search.`
        : `Uploaded ${succeeded.length} files.`,
    );
  }

  const failureList = failed.map((f) => `${f.filename} — ${f.reason}`).join("; ");

  if (succeeded.length === 0) {
    return actionError(
      results.length === 1
        ? failed[0].reason
        : `None of the ${results.length} files could be uploaded. ${failureList}`,
    );
  }

  return actionError(
    `Uploaded ${succeeded.length} of ${results.length} files. Failed: ${failureList}`,
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
