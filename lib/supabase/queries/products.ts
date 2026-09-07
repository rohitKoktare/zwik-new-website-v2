import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";
import { resolveAssetUrl } from "@/lib/storage/resolve-asset-url";
import type { Product, ProductImage, ProductSpec } from "@/types/product";

const PRODUCT_SELECT = `
  id, sku, name, slug, short_description, description, features,
  price, original_price, currency, amazon_url, is_featured, is_active, sort_order,
  category:categories!inner(name, slug),
  product_assets(role, sort_order, asset:assets(storage_path, alt_text, media_type))
`;

/**
 * Shape of a row returned by PRODUCT_SELECT. Supabase's client isn't wired to
 * generated database types yet (no project to introspect) — once one exists,
 * run `supabase gen types typescript` and replace this with the generated
 * `Database` type instead of hand-maintaining it.
 */
type ProductRow = {
  id: string;
  sku: string | null;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  features: ProductSpec[] | null;
  price: number;
  original_price: number | null;
  currency: string;
  amazon_url: string | null;
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  category: { name: string; slug: string } | { name: string; slug: string }[];
  product_assets: {
    role: string;
    sort_order: number;
    asset: {
      storage_path: string;
      alt_text: string | null;
      media_type: "image" | "video";
    } | null;
  }[];
};

function toProduct(row: ProductRow): Product {
  const category = Array.isArray(row.category) ? row.category[0] : row.category;

  const attached = [...row.product_assets]
    .filter((pa) => pa.asset)
    .sort((a, b) => a.sort_order - b.sort_order);

  /**
   * Split by media_type, not by `role`. Both are admin-controlled and can
   * disagree (a video uploaded into a 'gallery' slot), and only media_type is
   * derived from the actual MIME type at upload (lib/validation/asset.ts).
   * Trusting `role` here would hand an .mp4 to next/image.
   */
  const images: ProductImage[] = attached
    .filter((pa) => pa.asset!.media_type === "image")
    .map((pa) => ({
      url: resolveAssetUrl(pa.asset!.storage_path),
      altText: pa.asset!.alt_text ?? row.name,
      sortOrder: pa.sort_order,
    }));

  /**
   * First attached video, if any. The PDP does not render it yet
   * (docs/FRONTEND_BACKLOG.md §3) but the admin can already attach one, and
   * dropping it silently here would make that look like an admin bug.
   */
  const video = attached.find((pa) => pa.asset!.media_type === "video");

  return {
    id: row.id,
    sku: row.sku ?? "",
    name: row.name,
    slug: row.slug,
    shortDescription: row.short_description,
    description: row.description,
    specs: row.features ?? [],
    categorySlug: category?.slug ?? "",
    categoryName: category?.name ?? "",
    price: Number(row.price),
    originalPrice: row.original_price !== null ? Number(row.original_price) : null,
    currency: row.currency,
    amazonUrl: row.amazon_url,
    isFeatured: row.is_featured,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    images,
    videoUrl: video ? resolveAssetUrl(video.asset!.storage_path) : null,
  };
}

export async function getActiveProducts(categorySlug?: string): Promise<Product[]> {
  if (!isSupabaseConfigured) {
    logger.debug("getActiveProducts skipped: Supabase not configured");
    return [];
  }

  const supabase = createPublicClient();
  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (categorySlug) {
    query = query.eq("category.slug", categorySlug);
  }

  const { data, error } = await query;

  if (error) {
    logger.error("getActiveProducts failed", { error: error.message });
    return [];
  }

  return ((data ?? []) as unknown as ProductRow[]).map(toProduct);
}

export async function getFeaturedProducts(limit = 5): Promise<Product[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .eq("is_featured", true)
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error) {
    logger.error("getFeaturedProducts failed", { error: error.message });
    return [];
  }

  return ((data ?? []) as unknown as ProductRow[]).map(toProduct);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    logger.error("getProductBySlug failed", { error: error.message, slug });
    return null;
  }

  return data ? toProduct(data as unknown as ProductRow) : null;
}

export async function getRelatedProducts(excludeSlug: string, limit = 4): Promise<Product[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .neq("slug", excludeSlug)
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error) {
    logger.error("getRelatedProducts failed", { error: error.message });
    return [];
  }

  return ((data ?? []) as unknown as ProductRow[]).map(toProduct);
}
