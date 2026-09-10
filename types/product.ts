export type ProductSpec = {
  label: string;
  value: string;
};

export type ProductImage = {
  url: string;
  altText: string;
  sortOrder: number;
};

export type ProductCategory = {
  slug: string;
  name: string;
};

/**
 * Domain type used by UI code — distinct from the raw Supabase row shape
 * (see lib/supabase/queries/products.ts for the mapping).
 */
export type Product = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  specs: ProductSpec[];
  /**
   * A product can belong to more than one category (e.g. a dashboard cat
   * miniature assigned to both Monitor and Table decor) — ordered by each
   * category's own display sort order, so `categories[0]` is a stable choice
   * for a single "primary" badge/accent where the UI only has room for one.
   * Empty only if every assigned category has since been archived.
   */
  categories: ProductCategory[];
  price: number;
  originalPrice: number | null;
  currency: string;
  /** Kept for schema compatibility with DATABASE_DESIGN.md; unused while the
   * site runs on the WhatsApp cart-order model instead of Amazon redirect. */
  amazonUrl: string | null;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
  images: ProductImage[];
  /**
   * First video attached to the product, or null. Split from `images` by the
   * asset's media_type so a video can never reach next/image. Not yet rendered
   * on the PDP — see docs/FRONTEND_BACKLOG.md §3.
   */
  videoUrl: string | null;
};

export type ProductSummary = Pick<
  Product,
  "id" | "sku" | "name" | "slug" | "categories" | "price" | "images"
>;
