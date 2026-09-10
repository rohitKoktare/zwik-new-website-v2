"use client";

import { useActionState, useRef, useState } from "react";
import { uploadAssetsAction } from "@/lib/admin/assets/actions";
import { actionError, IDLE_RESULT, type ActionResult } from "@/lib/admin/action-result";
import { FormField } from "@/components/admin/form-field";
import { FormAlert } from "@/components/admin/form-alert";
import { SubmitButton } from "@/components/admin/submit-button";
import { Input } from "@/components/ui/input";
import {
  ALLOWED_TYPES_LABEL,
  ASSET_FOLDERS,
  ASSET_UPLOAD_ACCEPT,
  MAX_BATCH_UPLOAD_FILES,
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
  // One entry per file, in the same order the browser reports them — the
  // form renders one width/height hidden input pair per entry, so this order
  // is what ties a measured dimension back to its file (uploadAssetsAction
  // zips `files`/`widths`/`heights` back together by index).
  const [selected, setSelected] = useState<SelectedFile[]>([]);

  // The result is handled here, in the action path, rather than in an effect:
  // setState inside useEffect is disallowed in this codebase and would cause a
  // second render pass for no reason (see components/admin/confirm-action.tsx).
  const [state, formAction, isPending] = useActionState(
    async (previous: ActionResult, formData: FormData) => {
      let result: ActionResult;

      try {
        result = await uploadAssetsAction(previous, formData);
      } catch {
        // A rejected request never reaches the action, so it cannot return a
        // result of its own: a dropped connection, or a body larger than the
        // deployment's Server Action limit, both land here.
        return actionError(
          "The upload didn't go through. Check your connection and try again — a very large batch can be rejected before it reaches the server.",
        );
      }

      if (result.ok) {
        // Clear the per-file inputs so the next upload starts clean; the
        // folder stays put because uploads usually come in batches.
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (altTextRef.current) altTextRef.current.value = "";
        setSelected([]);
      }

      return result;
    },
    IDLE_RESULT,
  );

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      setSelected([]);
      return;
    }

    setSelected(files.map((file) => ({ name: file.name, size: file.size, width: null, height: null })));

    // Measure each image concurrently; a video (or an unmeasurable image)
    // just keeps its width/height as null, which the form already treats as
    // "not measured" rather than an error.
    files.forEach((file, index) => {
      if (!file.type.startsWith("image/")) return;

      measureImage(file).then((measured) => {
        if (!measured) return;

        setSelected((current) => {
          // Guard against a different batch having been picked while this one
          // measurement was still in flight.
          const entry = current[index];
          if (!entry || entry.name !== file.name || entry.size !== file.size) return current;
          const next = [...current];
          next[index] = { ...entry, ...measured };
          return next;
        });
      });
    });
  }

  const totalSize = selected.reduce((sum, file) => sum + file.size, 0);
  const oversized = selected.filter((file) => file.size > MAX_UPLOAD_BYTES);

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      <FormAlert message={state.formError} />

      {state.ok && state.message && (
        <p role="status" className="border border-border bg-muted px-3 py-2 text-sm">
          {state.message}
        </p>
      )}

      <FormField
        name="files"
        label="Files"
        hint={`${ALLOWED_TYPES_LABEL}, up to ${MAX_UPLOAD_LABEL} each. Select several at once to upload them together — up to ${MAX_BATCH_UPLOAD_FILES}.`}
        errors={state.fieldErrors?.files}
        required
      >
        <Input
          id="files"
          name="files"
          type="file"
          multiple
          ref={fileInputRef}
          accept={ASSET_UPLOAD_ACCEPT}
          required
          onChange={handleFileChange}
          className="h-auto py-1.5"
          aria-invalid={Boolean(state.fieldErrors?.files)}
        />
      </FormField>

      {selected.length > 0 && (
        <ul className="grid gap-1 text-xs text-muted-foreground">
          {selected.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span className={file.size > MAX_UPLOAD_BYTES ? "font-medium text-destructive" : "font-medium text-foreground"}>
                {file.name}
              </span>{" "}
              · {previewSize(file.size)}
              {file.width && file.height ? ` · ${file.width}×${file.height} px` : ""}
              {file.size > MAX_UPLOAD_BYTES && " — too large, will be rejected"}
            </li>
          ))}
          {selected.length > 1 && (
            <li className="mt-1">
              {selected.length} files selected · {previewSize(totalSize)} total
            </li>
          )}
        </ul>
      )}

      {oversized.length > 0 && (
        <p
          role="alert"
          className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {oversized.length === 1
            ? "One file is"
            : `${oversized.length} files are`}{" "}
          larger than {MAX_UPLOAD_LABEL} and will be rejected. Compress or re-export{" "}
          {oversized.length === 1 ? "it" : "them"} first.
        </p>
      )}

      {selected.map((file, index) => (
        <span key={`${file.name}-${index}-dims`}>
          <input type="hidden" name="widths" value={file.width ?? ""} />
          <input type="hidden" name="heights" value={file.height ?? ""} />
        </span>
      ))}

      <FormField
        name="folder"
        label="Folder"
        hint="Groups the files in storage. It does not affect where they can be used."
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
        hint={
          selected.length > 1
            ? "Applied to every file in this batch — leave it blank if they need different descriptions, and edit each one afterward."
            : "Describe the image for screen readers and search engines. You can add it later, but sooner is better."
        }
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
        <SubmitButton pendingLabel="Uploading…">
          {selected.length > 1 ? `Upload ${selected.length} files` : "Upload file"}
        </SubmitButton>
        {isPending && (
          <p role="status" className="text-xs text-muted-foreground">
            Uploading{selected.length > 0 ? ` ${selected.length} file${selected.length === 1 ? "" : "s"}` : ""} —
            this can take a moment for video.
          </p>
        )}
      </div>
    </form>
  );
}
