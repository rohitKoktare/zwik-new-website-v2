import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Centralized cache invalidation for admin writes.
 *
 * ARCHITECTURE.md §15: admin updates must invalidate the public pages they
 * affect so changes appear without a redeploy — without globally disabling
 * caching. Keeping the path list here stops each module from inventing its own
 * (and forgetting one).
 */

/** Pages whose content is derived from products/categories/assets. */
export function revalidateCatalog(slug?: string | null): void {
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/products/${slug}`);
}

/** Homepage-only content (hero slides, featured flags, reviews). */
export function revalidateHomepage(): void {
  revalidatePath("/");
}

/** Settings feed the header, footer, cart drawer and every WhatsApp link. */
export function revalidateSiteWide(): void {
  revalidatePath("/", "layout");
}

export function revalidateAdmin(path: string): void {
  revalidatePath(path);
}
