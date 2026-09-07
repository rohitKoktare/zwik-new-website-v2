import { isSupabaseConfigured, publicEnv } from "@/lib/validation/env";

export const MEDIA_BUCKET = "product-media";

/**
 * Single seam between "where an asset's bytes live" and the URL a component
 * renders.
 *
 * With Supabase configured, resolves to the public Storage URL. Without it
 * (local development before a project is connected), falls back to the seed
 * images bundled in /public/products so the storefront still renders.
 *
 * Nothing else in the app should construct a media URL.
 */
export function resolveAssetUrl(
  storagePath: string,
  bucket: string = MEDIA_BUCKET,
): string {
  if (isSupabaseConfigured && publicEnv.supabaseUrl) {
    const cleanPath = storagePath.replace(/^\/+/, "");
    return `${publicEnv.supabaseUrl}/storage/v1/object/public/${bucket}/${cleanPath}`;
  }

  const filename = storagePath.split("/").pop() ?? storagePath;
  return `/products/${filename}`;
}

/**
 * Builds a collision-proof storage key. Never reuses the client-supplied
 * filename as the key (DEVELOPMENT_STANDARDS.md §11) — it is only preserved as
 * display metadata on the `assets` row.
 */
export function buildStorageKey(folder: string, originalFilename: string): string {
  const extension = originalFilename.includes(".")
    ? `.${originalFilename.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")}`
    : "";

  const unique = globalThis.crypto.randomUUID();
  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, "").replace(/^\/+|\/+$/g, "");

  return `${safeFolder}/${unique}${extension}`;
}
