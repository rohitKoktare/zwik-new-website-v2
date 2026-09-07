"use client";

import { useActionState, useRef, useState } from "react";
import { uploadAssetAction } from "@/lib/admin/assets/actions";
import { actionError, IDLE_RESULT, type ActionResult } from "@/lib/admin/action-result";
import { FormField } from "@/components/admin/form-field";
import { FormAlert } from "@/components/admin/form-alert";
import { SubmitButton } from "@/components/admin/submit-button";
import { Input } from "@/components/ui/input";
import {
  ALLOWED_TYPES_LABEL,
  ASSET_FOLDERS,
  ASSET_UPLOAD_ACCEPT,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  type AssetFolder,
} from "@/lib/validation/asset";

const FOLDER_LABELS: Record<AssetFolder, string> = {
  products: "Product media",
  heroes: "Hero slides",
  homepage: "Homepage sections",
  videos: "Videos",
  brand: "Brand assets",
  general: "General",
};

type SelectedFile = {
  name: string;
  size: number;
  width: number | null;
  height: number | null;
};

/**
 * Rough size for the pre-upload preview only. formatFileSize() lives in a
 * server-only query module and cannot be imported into a client component.
 */
function previewSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reads an image's pixel dimensions in the browser so the library can show
 * them. Advisory only — the server stores these as display metadata and never
 * makes a decision on them.
 */
async function measureImage(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== "function") return null;

  try {
    const bitmap = await createImageBitmap(file);
    const measured = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return measured;
  } catch {
    // An unsupported or damaged image just means no dimensions to show.
    return null;
  }
}

export function AssetUploadForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const altTextRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<SelectedFile | null>(null);

  // The result is handled here, in the action path, rather than in an effect:
  // setState inside useEffect is disallowed in this codebase and would cause a
  // second render pass for no reason (see components/admin/confirm-action.tsx).
  const [state, formAction, isPending] = useActionState(
    async (previous: ActionResult, formData: FormData) => {
      let result: ActionResult;

      try {
        result = await uploadAssetAction(previous, formData);
      } catch {
        // A rejected request never reaches the action, so it cannot return a
        // result of its own: a dropped connection, or a body larger than the
        // deployment's Server Action limit, both land here.
        return actionError(
          "The upload didn't go through. Check your connection and try again — a very large file can be rejected before it reaches the server.",
        );
      }

      if (result.ok) {
        // Clear the per-file inputs so the next upload starts clean; the
        // folder stays put because uploads usually come in batches.
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (altTextRef.current) altTextRef.current.value = "";
        setSelected(null);
      }

      return result;
    },
    IDLE_RESULT,
  );

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setSelected(null);
      return;
    }

    setSelected({ name: file.name, size: file.size, width: null, height: null });

    if (!file.type.startsWith("image/")) return;

    const measured = await measureImage(file);
    if (!measured) return;

    // Guard against a different file having been picked while we measured.
    setSelected((current) =>
      current && current.name === file.name && current.size === file.size
        ? { ...current, ...measured }
        : current,
    );
  }

  const overLimit = selected !== null && selected.size > MAX_UPLOAD_BYTES;

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      <FormAlert message={state.formError} />

      {state.ok && state.message && (
        <p role="status" className="border border-border bg-muted px-3 py-2 text-sm">
          {state.message}
        </p>
      )}

      <FormField
        name="file"
        label="File"
        hint={`${ALLOWED_TYPES_LABEL}, up to ${MAX_UPLOAD_LABEL}.`}
        errors={state.fieldErrors?.file}
        required
      >
        <Input
          id="file"
          name="file"
          type="file"
          ref={fileInputRef}
          accept={ASSET_UPLOAD_ACCEPT}
          required
          onChange={handleFileChange}
          className="h-auto py-1.5"
          aria-invalid={Boolean(state.fieldErrors?.file)}
        />
      </FormField>

      {selected && (
        <p className="text-xs text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{selected.name}</span> ·{" "}
          {previewSize(selected.size)}
          {selected.width && selected.height
            ? ` · ${selected.width}×${selected.height} px`
            : ""}
        </p>
      )}

      {overLimit && (
        <p
          role="alert"
          className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          That file is larger than {MAX_UPLOAD_LABEL} and will be rejected. Compress or
          re-export it first.
        </p>
      )}

      {selected?.width && <input type="hidden" name="width" value={selected.width} />}
      {selected?.height && <input type="hidden" name="height" value={selected.height} />}

      <FormField
        name="folder"
        label="Folder"
        hint="Groups the file in storage. It does not affect where the file can be used."
        errors={state.fieldErrors?.folder}
        required
      >
        {/* A native select posts reliably in a plain server-action form; the
            Base UI Select is built for controlled client state instead. */}
        <select
          id="folder"
          name="folder"
          defaultValue="products"
          required
          aria-invalid={Boolean(state.fieldErrors?.folder)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
        >
          {ASSET_FOLDERS.map((folder) => (
            <option key={folder} value={folder}>
              {FOLDER_LABELS[folder]}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        name="altText"
        label="Alt text"
        hint="Describe the image for screen readers and search engines. You can add it later, but sooner is better."
        errors={state.fieldErrors?.altText}
      >
        <Input
          id="altText"
          name="altText"
          ref={altTextRef}
          maxLength={300}
          placeholder="e.g. Stainless steel water bottle on a kitchen counter"
          aria-invalid={Boolean(state.fieldErrors?.altText)}
        />
      </FormField>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Uploading…">Upload file</SubmitButton>
        {isPending && (
          <p role="status" className="text-xs text-muted-foreground">
            Uploading{selected ? ` ${selected.name}` : ""} — this can take a moment for
            video.
          </p>
        )}
      </div>
    </form>
  );
}
