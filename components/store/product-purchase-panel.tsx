"use client";

import { useState } from "react";
import { useCart } from "@/components/store/cart-provider";
import { buildWaLink } from "@/lib/whatsapp";
import { formatInr } from "@/lib/format";
import type { Product } from "@/types/product";

export function ProductPurchasePanel({
  product,
  whatsappNumber,
}: {
  product: Product;
  whatsappNumber: string | null;
}) {
  const [qty, setQty] = useState(1);
  const { addToCart } = useCart();
  const image = product.images[0];

  const askLink = whatsappNumber
    ? buildWaLink(
        whatsappNumber,
        `Hi ZWIK! I would like to order the ${product.name} (${product.sku}, ${formatInr(product.price)}).`,
      )
    : null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2.5">
        <div className="flex items-center border border-[var(--border-strong)]">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
            className="flex h-14 w-11.5 items-center justify-center text-lg text-[var(--gray-100)] hover:bg-[var(--layer-hover-01)]"
          >
            −
          </button>
          <span className="min-w-10.5 text-center font-mono text-base font-semibold">{qty}</span>
          <button
            type="button"
            onClick={() => setQty((q) => q + 1)}
            aria-label="Increase quantity"
            className="flex h-14 w-11.5 items-center justify-center text-lg text-[var(--gray-100)] hover:bg-[var(--layer-hover-01)]"
          >
            +
          </button>
        </div>
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
              qty,
            )
          }
          className="flex-1 bg-[var(--magenta-60)] text-base font-medium text-white hover:bg-[var(--purple-60)]"
        >
          Add to cart — {formatInr(product.price * qty)}
        </button>
      </div>
      {askLink && (
        <a
          href={askLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 items-center justify-center border border-[var(--gray-100)] text-[15px] text-[var(--gray-100)] hover:bg-[var(--gray-100)] hover:text-white"
        >
          Just ask about this piece
        </a>
      )}
      <div className="font-mono text-[11px] tracking-[1.2px] text-[var(--text-secondary)] uppercase">
        Cart orders are sent to us on WhatsApp for confirmation and payment
      </div>
    </div>
  );
}
