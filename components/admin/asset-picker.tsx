"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { AdminAsset } from "@/lib/supabase/queries/admin-assets";

/**
 * Selects one or many assets from the media library and submits the choice as
 * hidden inputs, so the enclosing form works with a plain server action and no
 * client-side form library.
 *
 * Assets are fetched server-side and passed in — this component never queries.
 */
export function AssetPicker({
  name,
  assets,
  defaultSelectedIds = [],
  multiple = false,
  emptyHint = "No assets yet. Upload one from the Assets page first.",
}: {
  /** Form field name. With `multiple`, one hidden input is emitted per asset. */
  name: string;
  assets: AdminAsset[];
  defaultSelectedIds?: string[];
  multiple?: boolean;
  emptyHint?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelectedIds);

  function toggle(assetId: string) {
    setSelected((current) => {
      if (multiple) {
        return current.includes(assetId)
          ? current.filter((id) => id !== assetId)
          : [...current, assetId];
      }
      return current[0] === assetId ? [] : [assetId];
    });
  }

  if (assets.length === 0) {
    return (
      <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">
        {emptyHint}
      </p>
    );
  }

  return (
    <div>
      {selected.map((assetId) => (
        <input key={assetId} type="hidden" name={name} value={assetId} />
      ))}

      <ul
        className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto border border-border p-2 sm:grid-cols-4"
        role="listbox"
        aria-multiselectable={multiple}
        aria-label="Media library"
      >
        {assets.map((asset) => {
          const index = selected.indexOf(asset.id);
          const isSelected = index !== -1;

          return (
            <li key={asset.id}>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => toggle(asset.id)}
                title={asset.filename}
                className={cn(
                  "relative block w-full overflow-hidden border-2 transition-colors",
                  isSelected ? "border-primary" : "border-transparent hover:border-border",
                )}
              >
                <span className="relative block aspect-square bg-muted">
                  {asset.mediaType === "image" ? (
                    <Image
                      src={asset.url}
                      alt={asset.altText ?? asset.filename}
                      fill
                      sizes="120px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center font-mono text-[10px] uppercase">
                      Video
                    </span>
                  )}
                </span>

                {isSelected && (
                  <span className="absolute top-1 left-1 flex size-5 items-center justify-center bg-primary text-[10px] font-semibold text-primary-foreground">
                    {multiple ? index + 1 : "✓"}
                  </span>
                )}

                <span className="block truncate px-1 py-1 text-left text-[10px] text-muted-foreground">
                  {asset.filename}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {multiple
          ? `${selected.length} selected. Click to add or remove; the number shows display order.`
          : selected.length > 0
            ? "1 selected. Click again to clear."
            : "None selected."}
      </p>
    </div>
  );
}
