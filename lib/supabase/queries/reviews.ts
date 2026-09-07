import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";
import { resolveAssetUrl } from "@/lib/storage/resolve-asset-url";
import type { Review } from "@/types/review";

type ReviewRow = {
  id: string;
  product_id: string;
  customer_display_name: string;
  rating: number;
  review_text: string;
  source: string;
  is_featured: boolean;
  sort_order: number;
  image_asset: { storage_path: string } | { storage_path: string }[] | null;
};

function toReview(row: ReviewRow): Review {
  const imageAsset = Array.isArray(row.image_asset) ? row.image_asset[0] : row.image_asset;

  return {
    id: row.id,
    productId: row.product_id,
    customerDisplayName: row.customer_display_name,
    rating: Number(row.rating),
    reviewText: row.review_text,
    imageUrl: imageAsset ? resolveAssetUrl(imageAsset.storage_path) : null,
    source: row.source,
    isFeatured: row.is_featured,
    sortOrder: row.sort_order,
  };
}

/** Returns [] until real reviews are added via /admin/reviews — no placeholder testimonials are seeded. */
export async function getFeaturedReviews(limit = 3): Promise<Review[]> {
  if (!isSupabaseConfigured) {
    logger.debug("getFeaturedReviews skipped: Supabase not configured");
    return [];
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, product_id, customer_display_name, rating, review_text, source, is_featured, sort_order, image_asset:assets(storage_path)",
    )
    .eq("is_active", true)
    .eq("is_featured", true)
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error) {
    logger.error("getFeaturedReviews failed", { error: error.message });
    return [];
  }

  return ((data ?? []) as unknown as ReviewRow[]).map(toReview);
}
