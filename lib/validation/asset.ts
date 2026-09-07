import { z } from "zod";
import { emptyToUndefined, integerSchema, uuidSchema } from "@/lib/validation/common";

/**
 * Asset upload validation.
 *
 * Everything an uploaded file claims about itself — its MIME type, its
 * filename, its extension — is attacker-controlled. This module holds the
 * allowlists and the byte-level signature check that the upload action uses to
 * decide whether the bytes are really what the browser said they were
 * (DEVELOPMENT_STANDARDS.md §11).
 *
 * Imported by the client upload form for the folder list, accept attribute and
 * size hint, so it must stay free of server-only imports.
 */

/** Matches the bucket's own 25 MiB limit in migration 0010. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "25 MB";

/** Storage folders an upload may target. Anything else is rejected. */
export const ASSET_FOLDERS = [
  "products",
  "heroes",
  "homepage",
  "videos",
  "brand",
  "general",
] as const;

export type AssetFolder = (typeof ASSET_FOLDERS)[number];

/**
 * The only file types that may be stored. Mirrors `allowed_mime_types` on the
 * `product-media` bucket — the two must be changed together, or an upload the
 * app accepts will be refused by Storage.
 */
export const ALLOWED_UPLOAD_TYPES = {
  "image/jpeg": { extensions: [".jpg", ".jpeg"], mediaType: "image" },
  "image/png": { extensions: [".png"], mediaType: "image" },
  "image/webp": { extensions: [".webp"], mediaType: "image" },
  "image/avif": { extensions: [".avif"], mediaType: "image" },
  "video/mp4": { extensions: [".mp4"], mediaType: "video" },
  "video/webm": { extensions: [".webm"], mediaType: "video" },
} as const satisfies Record<
  string,
  { extensions: readonly string[]; mediaType: "image" | "video" }
>;

export type AllowedMimeType = keyof typeof ALLOWED_UPLOAD_TYPES;

export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return Object.prototype.hasOwnProperty.call(ALLOWED_UPLOAD_TYPES, value);
}

/** `accept` attribute for the file input. A convenience, never a control. */
export const ASSET_UPLOAD_ACCEPT = Object.entries(ALLOWED_UPLOAD_TYPES)
  .flatMap(([mime, spec]) => [mime, ...spec.extensions])
  .join(",");

/** Human list used in error copy and hints. */
export const ALLOWED_TYPES_LABEL = "JPEG, PNG, WebP, AVIF, MP4 or WebM";

/** Splits on both separators so a Windows-style path can't hide a segment. */
const PATH_SEPARATORS = /[\\/]/;

/**
 * Lowercased extension including the dot, taken from the final path segment so
 * a name like `../../evil.png` cannot smuggle in a directory.
 */
export function fileExtension(filename: string): string {
  const base = filename.split(PATH_SEPARATORS).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

/**
 * The original name is kept only as display metadata (the storage key is
 * generated separately by buildStorageKey), but it is still rendered in the
 * admin UI, so strip path segments and control characters and bound its length.
 */
export function safeDisplayFilename(filename: string): string {
  const base = filename.split(PATH_SEPARATORS).pop() ?? "";
  const cleaned = Array.from(base)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join("")
    .trim();

  return (cleaned || "upload").slice(0, 200);
}

/** How many leading bytes the signature check needs. */
export const SIGNATURE_HEADER_BYTES = 32;

function startsWithBytes(header: Uint8Array, signature: readonly number[]): boolean {
  if (header.length < signature.length) return false;
  return signature.every((byte, index) => header[index] === byte);
}

function asciiAt(header: Uint8Array, start: number, length: number): string {
  if (length <= 0 || header.length < start + length) return "";

  let out = "";
  for (let index = start; index < start + length; index += 1) {
    out += String.fromCharCode(header[index]);
  }
  return out;
}

/**
 * Verifies the file's leading bytes against the type it claims to be.
 *
 * This is what makes the MIME allowlist mean anything: without it a
 * `.png`-named, `image/png`-labelled file could contain absolutely anything.
 * It is a container-format sanity gate, not a full decode — it shows the bytes
 * are plausibly the declared format, not that the file is otherwise safe.
 */
export function matchesDeclaredSignature(
  mimeType: AllowedMimeType,
  header: Uint8Array,
): boolean {
  switch (mimeType) {
    case "image/jpeg":
      return startsWithBytes(header, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWithBytes(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      // RIFF container carrying a WEBP form type at offset 8.
      return asciiAt(header, 0, 4) === "RIFF" && asciiAt(header, 8, 4) === "WEBP";
    case "image/avif":
      // ISO-BMFF `ftyp` box whose brand list names avif.
      return (
        asciiAt(header, 4, 4) === "ftyp" &&
        asciiAt(header, 8, header.length - 8).includes("avif")
      );
    case "video/mp4":
      return asciiAt(header, 4, 4) === "ftyp";
    case "video/webm":
      // EBML header, shared with Matroska.
      return startsWithBytes(header, [0x1a, 0x45, 0xdf, 0xa3]);
  }
}

/**
 * Upload form shape. The type/extension/signature checks live in the action
 * because they need the file's bytes; this covers everything decidable from
 * the submitted values alone.
 */
export const assetUploadSchema = z.object({
  file: z
    .instanceof(File, { message: "Choose a file to upload." })
    .refine((file) => file.size > 0, "Choose a file to upload — that one is empty.")
    .refine(
      (file) => file.size <= MAX_UPLOAD_BYTES,
      `Files must be ${MAX_UPLOAD_LABEL} or smaller.`,
    ),
  folder: z.enum(ASSET_FOLDERS, { message: "Choose where this file belongs." }),
  altText: emptyToUndefined(
    z.string().trim().max(300, "Alt text must be 300 characters or fewer"),
  ),
  // Measured in the browser purely so the admin list can show dimensions.
  // Advisory display metadata — never used for a security or sizing decision.
  width: emptyToUndefined(integerSchema({ min: 1, max: 100000 })),
  height: emptyToUndefined(integerSchema({ min: 1, max: 100000 })),
});

export type AssetUploadInput = z.infer<typeof assetUploadSchema>;

/**
 * Shape of countAssetReferences()'s result, restated here so client components
 * can type the prop without importing that server-only query module.
 */
export type AssetReferenceCounts = {
  products: number;
  heroSlides: number;
  reviews: number;
  total: number;
};

/**
 * "2 products and 1 hero slide". Lives here rather than in either caller so the
 * archive confirmation, the delete refusal and the grid all say the same thing
 * about the same asset.
 */
export function describeAssetReferences(references: AssetReferenceCounts): string {
  const parts: string[] = [];

  if (references.products > 0) {
    parts.push(`${references.products} ${references.products === 1 ? "product" : "products"}`);
  }
  if (references.heroSlides > 0) {
    parts.push(
      `${references.heroSlides} ${references.heroSlides === 1 ? "hero slide" : "hero slides"}`,
    );
  }
  if (references.reviews > 0) {
    parts.push(`${references.reviews} ${references.reviews === 1 ? "review" : "reviews"}`);
  }

  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0];

  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Inline alt-text edit. */
export const assetAltTextSchema = z.object({
  id: uuidSchema,
  altText: emptyToUndefined(
    z.string().trim().max(300, "Alt text must be 300 characters or fewer"),
  ),
});

/** Archive / restore / delete all identify their target the same way. */
export const assetIdSchema = z.object({ id: uuidSchema });
