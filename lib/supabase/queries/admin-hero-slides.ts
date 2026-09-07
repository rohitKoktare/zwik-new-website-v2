import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";
import { resolveAssetUrl } from "@/lib/storage/resolve-asset-url";
import type { Pagination } from "@/lib/admin/pagination";
import type { HeroCtaType } from "@/lib/validation/hero-slide";

/**
 * Admin reads for the homepage module: hero slides, plus the product rows the
 * featured-products panel toggles.
 *
 * Separate from the storefront queries because the admin must see inactive and
 * out-of-schedule slides — the public policy on `hero_slides` only exposes
 * `is_active = true` rows (migration 0006).
 */

export type AdminHeroSlide = {
  id: string;
  assetId: string | null;
  /** Resolved public URL for the slide image, or null when no asset is set. */
  assetUrl: string | null;
  assetAltText: string | null;
  assetFilename: string | null;
  heading: string;
  subheading: string | null;
  ctaLabel: string | null;
  ctaType: HeroCtaType | null;
  ctaUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  /** ISO UTC timestamps, exactly as stored. Formatted at the point of display. */
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AssetJoin = {
  storage_path: string;
  storage_bucket: string;
  alt_text: string | null;
  filename: string;
};

/**
 * Shape returned by HERO_SLIDE_SELECT. Hand-maintained because generated
 * Supabase types do not exist for this project yet — replace with the
 * generated `Database` type once `supabase gen types typescript` can run
 * (same note as lib/supabase/queries/products.ts).
 */
type HeroSlideRow = {
  id: string;
  asset_id: string | null;
  heading: string;
  subheading: string | null;
  cta_label: string | null;
  cta_type: HeroCtaType | null;
  cta_url: string | null;
  is_active: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  asset: AssetJoin | AssetJoin[] | null;
};

const HERO_SLIDE_SELECT = `
  id, asset_id, heading, subheading, cta_label, cta_type, cta_url,
  is_active, sort_order, starts_at, ends_at, created_at, updated_at,
  asset:assets(storage_path, storage_bucket, alt_text, filename)
`;

/**
 * Upper bound on the slide list. A hero carousel with dozens of slides is a
 * content problem rather than a paging problem, but the query is still capped
 * so it can never grow unbounded (DATABASE_DESIGN.md §19). The page tells the
 * admin when the cap has been hit.
 */
export const HERO_SLIDE_LIST_LIMIT = 50;

function toAdminHeroSlide(row: HeroSlideRow): AdminHeroSlide {
  // PostgREST returns an embedded to-one relation as an object, but types it
  // loosely enough that an array is possible; normalise both.
  const asset = Array.isArray(row.asset) ? (row.asset[0] ?? null) : row.asset;

  return {
    id: row.id,
    assetId: row.asset_id,
    assetUrl: asset ? resolveAssetUrl(asset.storage_path, asset.storage_bucket) : null,
    assetAltText: asset?.alt_text ?? null,
    assetFilename: asset?.filename ?? null,
    heading: row.heading,
    subheading: row.subheading,
    ctaLabel: row.cta_label,
    ctaType: row.cta_type,
    ctaUrl: row.cta_url,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listHeroSlidesForAdmin(
  limit: number = HERO_SLIDE_LIST_LIMIT,
): Promise<{ slides: AdminHeroSlide[]; totalCount: number; truncated: boolean }> {
  if (!isSupabaseConfigured) return { slides: [], totalCount: 0, truncated: false };

  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("hero_slides")
    .select(HERO_SLIDE_SELECT, { count: "exact" })
    // sort_order is the display order and is not unique, so created_at breaks
    // ties — without it the list could reshuffle between renders.
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    logger.error("listHeroSlidesForAdmin failed", { error: error.message });
    return { slides: [], totalCount: 0, truncated: false };
  }

  const slides = ((data ?? []) as unknown as HeroSlideRow[]).map(toAdminHeroSlide);
  const totalCount = count ?? slides.length;

  return { slides, totalCount, truncated: totalCount > slides.length };
}

export async function getHeroSlideById(id: string): Promise<AdminHeroSlide | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hero_slides")
    .select(HERO_SLIDE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error("getHeroSlideById failed", { error: error.message, id });
    return null;
  }

  return data ? toAdminHeroSlide(data as unknown as HeroSlideRow) : null;
}

/**
 * Featured products.
 *
 * These live here rather than in an admin-products query module because the
 * featured flag is homepage content — this module owns it end to end. Only the
 * columns the panel renders are selected.
 */
export type FeaturedProductCandidate = {
  id: string;
  name: string;
  slug: string;
  price: number;
  isFeatured: boolean;
  sortOrder: number;
};

type ProductCandidateRow = {
  id: string;
  name: string;
  slug: string;
  price: number | string;
  is_featured: boolean;
  sort_order: number;
};

export async function listFeaturedProductCandidates(options: {
  pagination: Pagination;
}): Promise<{ products: FeaturedProductCandidate[]; totalCount: number }> {
  if (!isSupabaseConfigured) return { products: [], totalCount: 0 };

  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("products")
    .select("id, name, slug, price, is_featured, sort_order", { count: "exact" })
    .eq("is_active", true)
    // Deliberately not ordered by is_featured: the list would reshuffle under
    // the admin's cursor the moment they saved.
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .range(options.pagination.from, options.pagination.to);

  if (error) {
    logger.error("listFeaturedProductCandidates failed", { error: error.message });
    return { products: [], totalCount: 0 };
  }

  const products = ((data ?? []) as unknown as ProductCandidateRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    // numeric(12,2) can arrive as a string depending on the driver path.
    price: Number(row.price),
    isFeatured: row.is_featured,
    sortOrder: row.sort_order,
  }));

  return { products, totalCount: count ?? 0 };
}

/** Total featured-and-active products, for the panel's summary line. */
export async function countFeaturedProducts(): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("is_featured", true);

  if (error) {
    logger.error("countFeaturedProducts failed", { error: error.message });
    return 0;
  }

  return count ?? 0;
}
