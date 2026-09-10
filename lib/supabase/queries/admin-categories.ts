import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";
import type { Pagination } from "@/lib/admin/pagination";

/**
 * Admin-side category reads. Separate from lib/supabase/queries/categories.ts
 * (the storefront's getActiveCategories) because admins must see inactive rows
 * plus the product counts needed to decide whether a category can be deleted.
 *
 * Generated database types do not exist yet, so row shapes are declared
 * explicitly here rather than inferred (DEVELOPMENT_STANDARDS.md §4).
 */

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  /**
   * Products assigned to this category via `product_categories`, both active
   * and hidden — a product may be counted under several categories at once.
   *
   * `product_categories.category_id` is `on delete restrict`, so this is not
   * decoration: a non-zero count means Postgres will refuse the delete.
   * Counting hidden products too is deliberate — a hidden product still holds
   * the join row.
   */
  productCount: number;
  /** Of `productCount`, how many are visible on the storefront. */
  activeProductCount: number;
  createdAt: string;
  updatedAt: string;
};

/** Status filters offered on the admin list. `undefined` means "no filter". */
export const CATEGORY_STATUS_FILTERS = ["active", "hidden", "empty"] as const;
export type CategoryStatusFilter = (typeof CATEGORY_STATUS_FILTERS)[number];

/** Validates an untrusted `?status=` value (DEVELOPMENT_STANDARDS.md §7). */
export function parseCategoryStatusFilter(
  value?: string,
): CategoryStatusFilter | undefined {
  const allowed: readonly string[] = CATEGORY_STATUS_FILTERS;
  return value !== undefined && allowed.includes(value)
    ? (value as CategoryStatusFilter)
    : undefined;
}

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /**
   * Embedded through product_categories (not a direct products(...) embed —
   * that relied on the single products.category_id FK, gone since migration
   * 0018), selected only for is_active so the counts can be derived.
   * Deliberately not `count` aggregate syntax: that cannot also give the
   * active/hidden split in one round trip.
   */
  product_categories: { product: { is_active: boolean } | { is_active: boolean }[] | null }[] | null;
};

const CATEGORY_SELECT =
  "id, name, slug, description, is_active, sort_order, created_at, updated_at, product_categories(product:products(is_active))";

/** PostgREST embeds a to-one relation as an object or a single-item array. */
function firstOrNull<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toAdminCategory(row: CategoryRow): AdminCategory {
  const products = (row.product_categories ?? [])
    .map((link) => firstOrNull(link.product))
    .filter((product): product is { is_active: boolean } => product !== null);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    productCount: products.length,
    activeProductCount: products.filter((product) => product.is_active).length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Paginated admin list. Never fetches the whole table — every admin list is
 * bounded by `.range()` (DATABASE_DESIGN.md §19).
 *
 * The `empty` filter is applied after the query rather than in Postgres: it
 * depends on the embedded product count, which PostgREST cannot filter on
 * without an aggregate. Category counts are small (a handful of rows), so the
 * page is still bounded; this is not a pattern to copy onto products.
 */
export async function listCategoriesForAdmin(options: {
  pagination: Pagination;
  status?: CategoryStatusFilter;
  search?: string;
}): Promise<{ categories: AdminCategory[]; totalCount: number }> {
  if (!isSupabaseConfigured) return { categories: [], totalCount: 0 };

  const supabase = await createClient();
  let query = supabase
    .from("categories")
    .select(CATEGORY_SELECT, { count: "exact" })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .range(options.pagination.from, options.pagination.to);

  if (options.status === "active") query = query.eq("is_active", true);
  if (options.status === "hidden") query = query.eq("is_active", false);

  if (options.search) {
    // Escape PostgREST's or() delimiters before interpolating user input.
    const term = options.search.replace(/[,()]/g, " ").trim();
    if (term) query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error("listCategoriesForAdmin failed", { error: error.message });
    return { categories: [], totalCount: 0 };
  }

  const mapped = ((data ?? []) as unknown as CategoryRow[]).map(toAdminCategory);
  const categories =
    options.status === "empty" ? mapped.filter((c) => c.productCount === 0) : mapped;

  return { categories, totalCount: count ?? 0 };
}

export async function getCategoryById(id: string): Promise<AdminCategory | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select(CATEGORY_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error("getCategoryById failed", { error: error.message, id });
    return null;
  }

  return data ? toAdminCategory(data as unknown as CategoryRow) : null;
}

/**
 * Whether any category exists at all, ignoring status.
 *
 * Cheaper than listing when a page only needs to know if the table is empty —
 * for example the products form, which cannot offer a category select until at
 * least one exists.
 */
export async function countCategories(): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true });

  if (error) {
    logger.error("countCategories failed", { error: error.message });
    return 0;
  }

  return count ?? 0;
}
