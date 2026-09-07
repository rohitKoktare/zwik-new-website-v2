import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";
import { formatSpecsForTextarea } from "@/lib/validation/product";
import type { Pagination } from "@/lib/admin/pagination";
import type { ProductSpec } from "@/types/product";

/**
 * Admin-side product reads. Separate from lib/supabase/queries/products.ts
 * because admins must see archived rows and uncategorised rows that the
 * storefront deliberately hides.
 */

export type AdminProductStatusFilter = "active" | "archived" | "all";

export type AdminProductListItem = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  categoryName: string | null;
  price: number;
  currency: string;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  shortDescription: string | null;
  description: string | null;
  specs: ProductSpec[];
  /** Specs rendered as the "Label: Value" lines the form edits. */
  specsText: string;
  categoryId: string | null;
  categoryName: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
  /** Gallery (image) asset ids in display order. */
  assetIds: string[];
  /** The attached video asset, if any. Kept out of `assetIds`. */
  videoAssetId: string | null;
  updatedAt: string | null;
};

type EmbeddedCategory = { id: string; name: string } | { id: string; name: string }[] | null;

type ProductListRow = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  price: number | string;
  currency: string;
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  category: EmbeddedCategory;
};

type ProductDetailRow = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  short_description: string | null;
  description: string | null;
  features: unknown;
  category_id: string | null;
  price: number | string;
  original_price: number | string | null;
  currency: string;
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  updated_at: string | null;
  category: EmbeddedCategory;
  product_assets: { asset_id: string; sort_order: number; role: string }[] | null;
};

const LIST_SELECT =
  "id, name, slug, sku, price, currency, is_featured, is_active, sort_order, category:categories(id, name)";

const DETAIL_SELECT =
  "id, name, slug, sku, short_description, description, features, category_id, price, original_price, currency, is_featured, is_active, sort_order, updated_at, category:categories(id, name), product_assets(asset_id, sort_order, role)";

function firstCategory(category: EmbeddedCategory): { id: string; name: string } | null {
  if (!category) return null;
  return Array.isArray(category) ? (category[0] ?? null) : category;
}

/**
 * `features` is untyped jsonb, so anything could be in there (older rows, a
 * hand-edited value). Keep only well-formed entries rather than trusting it.
 */
function toSpecs(raw: unknown): ProductSpec[] {
  if (!Array.isArray(raw)) return [];

  const specs: ProductSpec[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.label !== "string" || typeof record.value !== "string") continue;
    specs.push({ label: record.label, value: record.value });
  }

  return specs;
}

/**
 * PostgREST parses `or=(...)` as a comma-separated list of dotted filters, so a
 * raw search term could otherwise break out of its own filter and inject
 * another one. Strip every character with meaning in that grammar plus the
 * `ilike` wildcards; dots stay because real product names contain them.
 */
export function sanitizeSearchTerm(input: string): string {
  return input
    .replace(/[%,()"'\*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export async function listAdminProducts(options: {
  pagination: Pagination;
  status?: AdminProductStatusFilter;
  categoryId?: string;
  search?: string;
}): Promise<{ products: AdminProductListItem[]; totalCount: number }> {
  if (!isSupabaseConfigured) return { products: [], totalCount: 0 };

  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select(LIST_SELECT, { count: "exact" })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .range(options.pagination.from, options.pagination.to);

  if (options.status === "active") query = query.eq("is_active", true);
  if (options.status === "archived") query = query.eq("is_active", false);
  if (options.categoryId) query = query.eq("category_id", options.categoryId);

  const search = options.search ? sanitizeSearchTerm(options.search) : "";
  if (search) {
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error("listAdminProducts failed", { error: error.message });
    return { products: [], totalCount: 0 };
  }

  const products = ((data ?? []) as unknown as ProductListRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    categoryName: firstCategory(row.category)?.name ?? null,
    price: Number(row.price),
    currency: row.currency,
    isFeatured: row.is_featured,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }));

  return { products, totalCount: count ?? 0 };
}

export async function getAdminProductById(id: string): Promise<AdminProduct | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error("getAdminProductById failed", { error: error.message, id });
    return null;
  }

  if (!data) return null;

  const row = data as unknown as ProductDetailRow;
  const specs = toSpecs(row.features);

  // The video lives in the same join table under role 'video'. Keeping it out
  // of `assetIds` stops the gallery picker from re-saving it as an image.
  const links = [...(row.product_assets ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const assetIds = links.filter((l) => l.role !== "video").map((l) => l.asset_id);
  const videoAssetId = links.find((l) => l.role === "video")?.asset_id ?? null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    shortDescription: row.short_description,
    description: row.description,
    specs,
    specsText: formatSpecsForTextarea(specs),
    categoryId: row.category_id,
    categoryName: firstCategory(row.category)?.name ?? null,
    price: Number(row.price),
    originalPrice: row.original_price === null ? null : Number(row.original_price),
    currency: row.currency,
    isFeatured: row.is_featured,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    assetIds,
    videoAssetId,
    updatedAt: row.updated_at,
  };
}

/**
 * The audit "before"/"after" view of a product. Kept next to the row mapping so
 * a new column can't be added to one and forgotten in the other.
 */
export function toProductAuditRecord(product: AdminProduct): Record<string, unknown> {
  return {
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    shortDescription: product.shortDescription,
    description: product.description,
    specs: product.specs,
    categoryId: product.categoryId,
    price: product.price,
    originalPrice: product.originalPrice,
    currency: product.currency,
    isFeatured: product.isFeatured,
    isActive: product.isActive,
    sortOrder: product.sortOrder,
    assetIds: product.assetIds,
    videoAssetId: product.videoAssetId,
  };
}
