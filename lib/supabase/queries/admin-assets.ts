import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";
import { resolveAssetUrl } from "@/lib/storage/resolve-asset-url";
import type { Pagination } from "@/lib/admin/pagination";

/**
 * Admin-side asset reads. Distinct from lib/supabase/queries/* storefront
 * queries because admins can see archived rows that the public never should.
 */

export type AdminAsset = {
  id: string;
  filename: string;
  storageBucket: string;
  storagePath: string;
  url: string;
  mediaType: "image" | "video";
  mimeType: string;
  width: number | null;
  height: number | null;
  fileSizeBytes: number;
  altText: string | null;
  status: "active" | "archived";
  createdAt: string;
};

type AssetRow = {
  id: string;
  filename: string;
  storage_bucket: string;
  storage_path: string;
  media_type: "image" | "video";
  mime_type: string;
  width: number | null;
  height: number | null;
  file_size_bytes: number;
  alt_text: string | null;
  status: "active" | "archived";
  created_at: string;
};

const ASSET_SELECT =
  "id, filename, storage_bucket, storage_path, media_type, mime_type, width, height, file_size_bytes, alt_text, status, created_at";

function toAdminAsset(row: AssetRow): AdminAsset {
  return {
    id: row.id,
    filename: row.filename,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    url: resolveAssetUrl(row.storage_path, row.storage_bucket),
    mediaType: row.media_type,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    fileSizeBytes: row.file_size_bytes,
    altText: row.alt_text,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function listAssets(options: {
  pagination: Pagination;
  status?: "active" | "archived";
  mediaType?: "image" | "video";
}): Promise<{ assets: AdminAsset[]; totalCount: number }> {
  if (!isSupabaseConfigured) return { assets: [], totalCount: 0 };

  const supabase = await createClient();
  let query = supabase
    .from("assets")
    .select(ASSET_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(options.pagination.from, options.pagination.to);

  if (options.status) query = query.eq("status", options.status);
  if (options.mediaType) query = query.eq("media_type", options.mediaType);

  const { data, error, count } = await query;

  if (error) {
    logger.error("listAssets failed", { error: error.message });
    return { assets: [], totalCount: 0 };
  }

  return {
    assets: ((data ?? []) as AssetRow[]).map(toAdminAsset),
    totalCount: count ?? 0,
  };
}

/**
 * Active assets for selection UIs (product galleries, hero slides, reviews).
 * Bounded deliberately — an unbounded fetch would break once the library grows
 * (DATABASE_DESIGN.md §19).
 */
export async function listSelectableAssets(
  mediaType?: "image" | "video",
  limit = 200,
): Promise<AdminAsset[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = await createClient();
  let query = supabase
    .from("assets")
    .select(ASSET_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (mediaType) query = query.eq("media_type", mediaType);

  const { data, error } = await query;

  if (error) {
    logger.error("listSelectableAssets failed", { error: error.message });
    return [];
  }

  return ((data ?? []) as AssetRow[]).map(toAdminAsset);
}

export async function getAssetById(id: string): Promise<AdminAsset | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .select(ASSET_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error("getAssetById failed", { error: error.message, id });
    return null;
  }

  return data ? toAdminAsset(data as AssetRow) : null;
}

/**
 * Counts references to an asset. Used before archiving/deleting so a shared
 * asset that is still in use cannot be pulled out from under a live page
 * (ARCHITECTURE.md §9).
 */
export async function countAssetReferences(
  assetId: string,
): Promise<{ products: number; heroSlides: number; reviews: number; total: number }> {
  if (!isSupabaseConfigured) {
    return { products: 0, heroSlides: 0, reviews: 0, total: 0 };
  }

  const supabase = await createClient();

  const [productAssets, heroSlides, reviews] = await Promise.all([
    supabase
      .from("product_assets")
      .select("product_id", { count: "exact", head: true })
      .eq("asset_id", assetId),
    supabase
      .from("hero_slides")
      .select("id", { count: "exact", head: true })
      .eq("asset_id", assetId),
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("image_asset_id", assetId),
  ]);

  const products = productAssets.count ?? 0;
  const heroSlidesCount = heroSlides.count ?? 0;
  const reviewsCount = reviews.count ?? 0;

  return {
    products,
    heroSlides: heroSlidesCount,
    reviews: reviewsCount,
    total: products + heroSlidesCount + reviewsCount,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
