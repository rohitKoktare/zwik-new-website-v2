import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";
import { resolveAssetUrl } from "@/lib/storage/resolve-asset-url";
import type { Product, ProductImage, ProductSpec } from "@/types/product";

/**
 * No `!inner` through categories any more (contrast the old single-FK version
 * of this file). A product's categories now live in the `product_categories`
 * join table (migration 0018) and are fetched purely for display — a product
 * with zero *active* categories (all archived after assignment) still shows
 * up here with an empty `categories` array rather than disappearing from the
 * catalogue entirely. Category-scoped browsing (`?place=<slug>`) is a
 * separate, deliberate filter — see `getActiveProducts`'s `categoryId` param.
 */
const PRODUCT_SELECT = `
  id, sku, name, slug, short_description, description, features,
  price, original_price, currency, amazon_url, is_featured, is_active, sort_order,
  product_categories(category:categories(name, slug, sort_order)),
  product_assets(role, sort_order, asset:assets(storage_path, alt_text, media_type))
`;

type EmbeddedCategory =
  | { name: string; slug: string; sort_order: number }
  | { name: string; slug: string; sort_order: number }[]
  | null;

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
  product_categories: { category: EmbeddedCategory }[];
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

/** PostgREST embeds a to-one relation as an object or a single-item array. */
function firstOrNull<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toProduct(row: ProductRow): Product {
  const categories = row.product_categories
    .map((link) => firstOrNull(link.category))
    .filter((category): category is { name: string; slug: string; sort_order: number } => category !== null)
    // Deterministic order: the same order categories appear in everywhere
    // else on the site (footer, homepage tiles, catalog filter chips), so
    // the card badge/PDP breadcrumb picks a stable "first" category rather
    // than whatever order Postgres happened to return the join rows in.
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((category) => ({ slug: category.slug, name: category.name }));

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
    categories,
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

/**
 * @param categoryId Filters to products assigned to this category. Takes the
 * id, not the slug — the one caller (`app/(store)/products/page.tsx`) already
 * resolves and validates the slug against the active category list before
 * calling this, so it has the id in hand; resolving it a second time in here
 * would be a redundant query.
 *
 * Implemented as a separate bounded lookup against `product_categories`
 * rather than an `!inner` embed + dotted filter, the same trade-off already
 * made in `lib/supabase/queries/admin-products.ts`'s `listAdminProducts`: a
 * filtered embed would also filter the *returned* category list down to just
 * the matched one, breaking any product's own display of its other
 * categories.
 */
export async function getActiveProducts(categoryId?: string): Promise<Product[]> {
  if (!isSupabaseConfigured) {
    logger.debug("getActiveProducts skipped: Supabase not configured");
    return [];
  }

  const supabase = createPublicClient();

  let productIds: string[] | null = null;
  if (categoryId) {
    const { data: matches, error: matchError } = await supabase
      .from("product_categories")
      .select("product_id")
      .eq("category_id", categoryId);

    if (matchError) {
      logger.error("getActiveProducts category lookup failed", { error: matchError.message });
      return [];
    }

    productIds = (matches ?? []).map((row) => row.product_id);
    if (productIds.length === 0) return [];
  }

  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (productIds) query = query.in("id", productIds);

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
