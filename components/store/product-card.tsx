"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/store/cart-provider";
import { getCategoryAccent } from "@/lib/store/category-accent";
import { formatInr } from "@/lib/format";
import type { ProductSummary } from "@/types/product";

/**
 * Catalog card, matching the reference's hover behaviour:
 *   - the border darkens to gray-100
 *   - the image scales to 1.06 over 240ms (the frame clips it, so the crop
 *     tightens rather than the card growing)
 *   - a category-accent wash fades in over the card at 110ms
 *
 * `zw-rise` plays on mount, which is what makes a freshly filtered catalog
 * settle in rather than snap. Both the wash and the rise resolve to their
 * final state under `prefers-reduced-motion` via the global rule in
 * globals.css, so neither is guarded here.
 */
export function ProductCard({ product }: { product: ProductSummary }) {
  const { addToCart } = useCart();
  const accent = getCategoryAccent(product.categorySlug);
  const image = product.images[0];

  return (
    <article className="group relative flex-none animate-[zw-rise_260ms_var(--easing-standard)] border border-[var(--gray-20)] bg-white transition-colors duration-150 hover:border-[var(--gray-100)]">
      {/* Accent wash. Sits above the card background but below the content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[110ms] ease-[var(--easing-standard)] group-hover:opacity-[0.06]"
        style={{ background: accent.bg }}
      />

      <Link href={`/products/${product.slug}`} className="relative block">
        <div className="relative aspect-square overflow-hidden bg-[var(--gray-10)]">
          {image && (
            <Image
              src={image.url}
              alt={image.altText}
              fill
              sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-[240ms] ease-[var(--easing-standard)] group-hover:scale-[1.06]"
            />
          )}
          <div
            className="absolute top-0 left-0 px-2.5 py-1 font-mono text-[10px] tracking-[1.4px] uppercase"
            style={{ background: accent.bg, color: accent.fg }}
          >
            {product.categoryName}
          </div>
        </div>
        <div className="p-4">
          <div className="flex min-h-[46px] items-start justify-between gap-3">
            <h3 className="min-w-0 text-[19px] leading-tight font-semibold tracking-tight">
              {product.name}
            </h3>
            <span className="font-mono text-[17px] leading-snug font-semibold whitespace-nowrap">
              {formatInr(product.price)}
            </span>
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={() =>
          addToCart(
            {
              productId: product.id,
              sku: product.sku,
              name: product.name,
              slug: product.slug,
              price: product.price,
              imageUrl: image?.url ?? "",
            },
            1,
          )
        }
        className="relative mx-4 mb-4 h-10 w-[calc(100%-2rem)] bg-[var(--gray-100)] font-mono text-xs tracking-[1.4px] text-white uppercase transition-colors duration-150 hover:bg-[var(--magenta-60)]"
      >
        Add to cart
      </button>
    </article>
  );
}
