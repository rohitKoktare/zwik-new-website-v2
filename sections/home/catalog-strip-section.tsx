import { ProductCard } from "@/components/store/product-card";
import { AutoScrollStrip } from "@/components/store/auto-scroll-strip";
import { Reveal } from "@/components/store/reveal";
import type { ProductSummary } from "@/types/product";

export function CatalogStripSection({ products }: { products: ProductSummary[] }) {
  return (
    <section id="catalog" className="py-14 md:py-16">
      <Reveal className="mx-6 mb-6 flex items-end justify-between gap-6 border-b border-[var(--gray-100)] pb-4.5 md:mx-12">
        <div>
          <h2 className="text-[44px] leading-[1.02] font-semibold tracking-[-0.035em]">
            The whole catalog
          </h2>
          <div className="mt-1.5 font-mono text-xs tracking-[1.4px] text-[var(--text-secondary)] uppercase">
            {products.length === 1 ? "1 piece live" : `${products.length} pieces live`}
            {products.length > 0 && " · scroll sideways →"}
          </div>
        </div>
      </Reveal>

      {products.length === 0 ? (
        <p className="mx-6 text-[var(--text-secondary)] md:mx-12">
          The catalog is being set up — check back soon.
        </p>
      ) : (
        <AutoScrollStrip
          className="zw-strip flex gap-px overflow-x-auto bg-white px-6 pt-1 pb-5 md:px-12"
          ariaLabel="Catalog"
        >
          {products.map((product) => (
            <div key={product.id} className="w-[330px] flex-none">
              <ProductCard product={product} />
            </div>
          ))}
        </AutoScrollStrip>
      )}
    </section>
  );
}
