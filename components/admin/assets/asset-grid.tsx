"use client";

import Image from "next/image";
import { useActionState } from "react";
import {
  archiveAssetAction,
  deleteAssetAction,
  restoreAssetAction,
  updateAssetAltTextAction,
} from "@/lib/admin/assets/actions";
import { IDLE_RESULT } from "@/lib/admin/action-result";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeAssetReferences, type AssetReferenceCounts } from "@/lib/validation/asset";
import type { AdminAsset } from "@/lib/supabase/queries/admin-assets";

/**
 * Media library grid.
 *
 * A Client Component because each tile carries its own alt-text form and
 * confirmation dialogs. Everything it renders is prepared on the server —
 * including the formatted file size and the reference counts — so this file
 * never imports a server-only query module.
 */

export type AssetGridItem = {
  asset: AdminAsset;
  /** Pre-formatted by formatFileSize() on the server. */
  sizeLabel: string;
  references: AssetReferenceCounts;
};

export function AssetGrid({
  items,
  canDelete,
}: {
  items: AssetGridItem[];
  /** True only for roles in DESTRUCTIVE_ROLES. The action re-checks anyway. */
  canDelete: boolean;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <AssetCard key={item.asset.id} item={item} canDelete={canDelete} />
      ))}
    </ul>
  );
}

function AssetCard({ item, canDelete }: { item: AssetGridItem; canDelete: boolean }) {
  const { asset, sizeLabel, references } = item;
  const isActive = asset.status === "active";
  const inUse = references.total > 0;

  const dimensions =
    asset.width && asset.height ? `${asset.width}×${asset.height}` : "Dimensions unknown";

  return (
    <li className="flex flex-col border border-border bg-background">
      <div className="relative aspect-square w-full bg-muted">
        {asset.mediaType === "image" ? (
          // Empty alt when none is stored: the filename below already names the
          // file, so repeating it would only add noise for screen reader users.
          <Image
            src={asset.url}
            alt={asset.altText ?? ""}
            fill
            sizes="(min-width: 1280px) 20rem, (min-width: 640px) 40vw, 90vw"
            className="object-cover"
          />
        ) : (
          <video
            src={asset.url}
            preload="metadata"
            muted
            playsInline
            aria-label={asset.altText ?? asset.filename}
            className="h-full w-full object-cover"
          />
        )}

        <span className="absolute top-2 left-2 bg-background/90 px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
          {asset.mediaType === "image" ? "Image" : "Video"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium" title={asset.filename}>
            {asset.filename}
          </p>
          <StatusBadge active={isActive} activeLabel="Active" inactiveLabel="Archived" />
        </div>

        <p className="text-xs text-muted-foreground">
          {dimensions} · {sizeLabel} · {asset.mimeType}
        </p>

        <p className="text-xs text-muted-foreground">
          {inUse ? `Used by ${describeAssetReferences(references)}.` : "Not used anywhere yet."}
        </p>

        <AltTextForm asset={asset} />

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {isActive ? (
            <ConfirmAction
              action={archiveAssetAction}
              hiddenFields={{ id: asset.id }}
              trigger={
                <Button variant="outline" size="sm">
                  Archive
                </Button>
              }
              title={`Archive ${asset.filename}?`}
              description={
                inUse
                  ? `This file is used by ${describeAssetReferences(references)}. Archiving removes it from the media library and from asset pickers, but it keeps appearing in those places until you replace it there. You can restore it at any time.`
                  : "Archiving removes this file from the media library and from asset pickers. Nothing uses it right now, and you can restore it at any time."
              }
              confirmLabel="Archive"
            />
          ) : (
            <ConfirmAction
              action={restoreAssetAction}
              hiddenFields={{ id: asset.id }}
              trigger={
                <Button variant="outline" size="sm">
                  Restore
                </Button>
              }
              title={`Restore ${asset.filename}?`}
              description="This file becomes available again in the media library and in asset pickers."
              confirmLabel="Restore"
            />
          )}

          {canDelete && !inUse && (
            <ConfirmAction
              action={deleteAssetAction}
              hiddenFields={{ id: asset.id }}
              trigger={
                <Button variant="destructive" size="sm">
                  Delete
                </Button>
              }
              title={`Permanently delete ${asset.filename}?`}
              description="The file is removed from storage and its record is deleted. This cannot be undone — archive it instead if you might want it back."
              confirmLabel="Delete permanently"
              destructive
            />
          )}

          {canDelete && inUse && (
            <p className="text-xs text-muted-foreground">
              Still in use — cannot be deleted.
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Inline alt-text editor. Alt text is the accessibility and SEO text for every
 * place this asset appears, so it is editable directly from the list rather
 * than behind a separate screen.
 */
function AltTextForm({ asset }: { asset: AdminAsset }) {
  const [state, formAction] = useActionState(updateAssetAltTextAction, IDLE_RESULT);
  const fieldId = `alt-text-${asset.id}`;
  const errors = state.fieldErrors?.altText;

  return (
    <form action={formAction} className="grid gap-1.5">
      <input type="hidden" name="id" value={asset.id} />

      <Label htmlFor={fieldId} className="text-xs">
        Alt text
      </Label>

      <div className="flex items-start gap-2">
        <Input
          id={fieldId}
          name="altText"
          defaultValue={asset.altText ?? ""}
          maxLength={300}
          placeholder="Describe this file"
          aria-invalid={Boolean(errors)}
          aria-describedby={errors ? `${fieldId}-error` : undefined}
          className="h-7 text-xs"
        />
        <SubmitButton variant="outline" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </div>

      {asset.mediaType === "image" && !asset.altText && (
        <p className="text-xs text-muted-foreground">
          No alt text yet — add one so screen readers and search engines can describe it.
        </p>
      )}

      {errors && (
        <p id={`${fieldId}-error`} role="alert" className="text-xs font-medium text-destructive">
          {errors.join(" ")}
        </p>
      )}

      {state.formError && !errors && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {state.formError}
        </p>
      )}

      {state.ok && state.message && (
        <p role="status" className="text-xs text-muted-foreground">
          {state.message}
        </p>
      )}
    </form>
  );
}
