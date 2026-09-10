import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/store/product-card";
import { Reveal } from "@/components/store/reveal";
import { getActiveCategories } from "@/lib/supabase/queries/categories";
import { getActiveProducts } from "@/lib/supabase/queries/products";

export const metadata: Metadata = {
  title: "Catalog",
  description: "Hand-painted miniature decor for desks, monitors, dashboards, and shelves.",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ place?: string }>;
}) {
  const { place } = await searchParams;

  /**
   * Categories are fetched first so `place` can be validated against the
   * active set before it reaches the product query. An unknown or stale
   * `?place=` therefore falls back to the full catalog rather than rendering
   * an empty grid, and the filter runs in Postgres instead of fetching every
   * product and discarding most of them here.
   */
  const categories = await getActiveCategories();
  const activeCategory = categories.find((c) => c.slug === place);
  const products = await getActiveProducts(activeCategory?.id);

  return (
    <section className="py-14 md:py-16">
      <div className="mx-6 mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--gray-100)] pb-4.5 md:mx-12">
        <div>
          <h1 className="text-[44px] leading-[1.02] font-semibold tracking-[-0.035em]">
            {activeCategory ? `For your ${activeCategory.name.toLowerCase()}` : "The whole catalog"}
          </h1>
          <div className="mt-1.5 font-mono text-xs tracking-[1.4px] text-[var(--text-secondary)] uppercase">
            {products.length === 1 ? "1 piece live" : `${products.length} pieces live`}
          </div>
        </div>
      </div>

      <nav className="mx-6 mb-8 flex flex-wrap gap-2 md:mx-12" aria-label="Filter by category">
        <Link
          href="/products"
          className={`px-3.5 py-2 font-mono text-xs tracking-[1.2px] uppercase ${
            activeCategory
              ? "border border-[var(--gray-20)] text-[var(--text-secondary)] hover:border-[var(--gray-100)]"
              : "bg-[var(--gray-100)] text-white"
          }`}
        >
          All
        </Link>
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/products?place=${category.slug}`}
            className={`px-3.5 py-2 font-mono text-xs tracking-[1.2px] uppercase ${
              activeCategory?.slug === category.slug
                ? "bg-[var(--gray-100)] text-white"
                : "border border-[var(--gray-20)] text-[var(--text-secondary)] hover:border-[var(--gray-100)]"
            }`}
          >
            {category.name}
          </Link>
        ))}
      </nav>

      {products.length === 0 ? (
        <p className="mx-6 text-[var(--text-secondary)] md:mx-12">
          Nothing here yet — check back soon.
        </p>
      ) : (
        <div className="mx-6 grid grid-cols-1 gap-px sm:grid-cols-2 md:mx-12 lg:grid-cols-3 xl:grid-cols-4">
          {/*
            Staggered across the row, capped so a long catalog does not build up
            a delay measured in seconds at the bottom of the page.
          */}
          {products.map((product, index) => (
            <Reveal key={product.id} delayMs={Math.min(index, 7) * 60}>
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}
