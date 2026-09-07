import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";
import { resolveAssetUrl } from "@/lib/storage/resolve-asset-url";
import type { Pagination } from "@/lib/admin/pagination";

/**
 * Admin-side review reads. Separate from lib/supabase/queries/reviews.ts
 * (the storefront's getFeaturedReviews) because admins must see hidden and
 * unfeatured rows, plus the fields needed to edit them.
 *
 * Generated database types do not exist yet, so row shapes are declared
 * explicitly here rather than inferred (DEVELOPMENT_STANDARDS.md §4).
 */

export type AdminReview = {
  id: string;
  productId: string;
  /** Null only if the joined product row is unreadable; the FK is NOT NULL. */
  productName: string | null;
  productSlug: string | null;
  customerDisplayName: string;
  rating: number;
  reviewText: string;
  imageAssetId: string | null;
  imageUrl: string | null;
  imageAltText: string | null;
  /** Where the review genuinely came from — see DATABASE_DESIGN.md §8. */
  source: string;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ReviewProductOption = {
  id: string;
  name: string;
  isActive: boolean;
};

/** Status filters offered on the admin list. `undefined` means "no filter". */
export const REVIEW_STATUS_FILTERS = ["active", "hidden", "featured"] as const;
export type ReviewStatusFilter = (typeof REVIEW_STATUS_FILTERS)[number];

/** Validates an untrusted `?status=` value (DEVELOPMENT_STANDARDS.md §7). */
export function parseReviewStatusFilter(value?: string): ReviewStatusFilter | undefined {
  const allowed: readonly string[] = REVIEW_STATUS_FILTERS;
  return value !== undefined && allowed.includes(value)
    ? (value as ReviewStatusFilter)
    : undefined;
}

type JoinedProduct = { name: string; slug: string };
type JoinedAsset = {
  storage_path: string;
  storage_bucket: string;
  alt_text: string | null;
};

type ReviewRow = {
  id: string;
  product_id: string;
  customer_display_name: string;
  /** numeric(2,1) can arrive as a string depending on the driver. */
  rating: number | string;
  review_text: string;
  image_asset_id: string | null;
  source: string;
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  product: JoinedProduct | JoinedProduct[] | null;
  image_asset: JoinedAsset | JoinedAsset[] | null;
};

type ProductOptionRow = { id: string; name: string; is_active: boolean };

const REVIEW_SELECT =
  "id, product_id, customer_display_name, rating, review_text, image_asset_id, source, is_featured, is_active, sort_order, created_at, updated_at, product:products(name, slug), image_asset:assets(storage_path, storage_bucket, alt_text)";

/** PostgREST embeds a to-one relation as an object or a single-item array. */
function firstOrNull<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toAdminReview(row: ReviewRow): AdminReview {
  const product = firstOrNull(row.product);
  const imageAsset = firstOrNull(row.image_asset);

  return {
    id: row.id,
    productId: row.product_id,
    productName: product?.name ?? null,
    productSlug: product?.slug ?? null,
    customerDisplayName: row.customer_display_name,
    rating: Number(row.rating),
    reviewText: row.review_text,
    imageAssetId: row.image_asset_id,
    imageUrl: imageAsset
      ? resolveAssetUrl(imageAsset.storage_path, imageAsset.storage_bucket)
      : null,
    imageAltText: imageAsset?.alt_text ?? null,
    source: row.source,
    isFeatured: row.is_featured,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Paginated admin list. Never fetches the whole table — every admin list is
 * bounded by `.range()` (DATABASE_DESIGN.md §19).
 */
export async function listReviewsForAdmin(options: {
  pagination: Pagination;
  productId?: string;
  status?: ReviewStatusFilter;
}): Promise<{ reviews: AdminReview[]; totalCount: number }> {
  if (!isSupabaseConfigured) return { reviews: [], totalCount: 0 };

  const supabase = await createClient();
  let query = supabase
    .from("reviews")
    .select(REVIEW_SELECT, { count: "exact" })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .range(options.pagination.from, options.pagination.to);

  if (options.productId) query = query.eq("product_id", options.productId);
  if (options.status === "active") query = query.eq("is_active", true);
  if (options.status === "hidden") query = query.eq("is_active", false);
  if (options.status === "featured") query = query.eq("is_featured", true);

  const { data, error, count } = await query;

  if (error) {
    logger.error("listReviewsForAdmin failed", { error: error.message });
    return { reviews: [], totalCount: 0 };
  }

  return {
    reviews: ((data ?? []) as unknown as ReviewRow[]).map(toAdminReview),
    totalCount: count ?? 0,
  };
}

export async function getReviewById(id: string): Promise<AdminReview | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(REVIEW_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error("getReviewById failed", { error: error.message, id });
    return null;
  }

  return data ? toAdminReview(data as unknown as ReviewRow) : null;
}

/**
 * Products offered in the review form's product select and the list filter.
 *
 * Bounded like every other selection query. Defaults to active products only
 * — a review should normally be attached to a product customers can see — but
 * the list filter passes `activeOnly: false` so reviews on a hidden product
 * are still findable.
 */
export async function listReviewProductOptions(options?: {
  activeOnly?: boolean;
  limit?: number;
}): Promise<ReviewProductOption[]> {
  if (!isSupabaseConfigured) return [];

  const activeOnly = options?.activeOnly ?? true;
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select("id, name, is_active")
    .order("name", { ascending: true })
    .limit(options?.limit ?? 200);

  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;

  if (error) {
    logger.error("listReviewProductOptions failed", { error: error.message });
    return [];
  }

  return ((data ?? []) as ProductOptionRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.is_active,
  }));
}
