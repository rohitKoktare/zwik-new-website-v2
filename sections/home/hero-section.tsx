"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatInr } from "@/lib/format";
import type { Product } from "@/types/product";

const ROTATE_MS = 4600;
const WORD_MS = 2000;

/**
 * Cycled in the headline, as in the design reference. Each is a plausible
 * description of the product, so whichever is on screen reads correctly.
 */
const WORDS = ["MINIATURE", "TINY", "POCKET", "LITTLE", "DESKTOP"];

export function HeroSection({ heroProducts }: { heroProducts: Product[] }) {
  const [index, setIndex] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    if (heroProducts.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % heroProducts.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [heroProducts.length]);

  useEffect(() => {
    // The headline word cycles regardless of how many hero images there are.
    const id = setInterval(() => setWordIndex((i) => (i + 1) % WORDS.length), WORD_MS);
    return () => clearInterval(id);
  }, []);

  const current = heroProducts[index];

  /**
   * Two animation names for one effect. Re-applying the same name to the same
   * element does not restart a CSS animation, so alternating -a and -b on each
   * swap is what makes every word actually animate in.
   */
  const wordAnimation = wordIndex % 2 ? "zw-word-a" : "zw-word-b";

  return (
    <section className="grid grid-cols-1 border-b border-[var(--gray-100)] md:grid-cols-[1.05fr_1fr]">
      <div className="flex flex-col justify-between gap-9 border-b border-[var(--gray-100)] px-6 py-12 md:border-r md:border-b-0 md:px-12 md:py-17">
        <div>
          <div className="inline-block bg-[var(--gray-100)] px-2.5 py-1.5 font-mono text-[11px] tracking-[2px] text-white uppercase">
            Miniature decor · desk · monitor · dashboard
          </div>
          <h1 className="mt-6 text-[clamp(48px,6.8vw,106px)] leading-[0.84] font-semibold tracking-[-0.05em]">
            YOUR
            <br />
            OWN
            <br />
            <span
              key={wordIndex}
              className="inline-block text-[var(--magenta-60)]"
              style={{
                animation: `${wordAnimation} 320ms var(--easing-standard)`,
              }}
            >
              {WORDS[wordIndex]}
            </span>
            <br />
            WORLD.
          </h1>
          <p className="mt-7.5 max-w-[44ch] text-[17px] leading-[1.55] text-[var(--text-secondary)]">
            Tiny hand-painted pieces that make a desk feel like yours. Perch one on your monitor,
            park one on the dashboard, build a whole village on a shelf.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/products"
            className="flex h-[54px] items-center bg-[var(--magenta-60)] px-7.5 text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[var(--purple-60)] hover:no-underline"
          >
            See the catalog
          </Link>
          <Link
            href="/contact"
            className="flex h-[54px] items-center border border-[var(--gray-100)] px-7.5 text-[15px] font-medium text-[var(--gray-100)] transition-colors duration-150 hover:bg-[var(--gray-100)] hover:text-white hover:no-underline"
          >
            Ask us anything
          </Link>
        </div>
      </div>

      <div className="relative min-h-[360px] overflow-hidden bg-[var(--gray-10)] md:min-h-[540px]">
        {heroProducts.map((product, i) => {
          const image = product.images[0];
          if (!image) return null;
          return (
            <div
              key={product.id}
              className="absolute inset-0 transition-opacity duration-900 ease-[var(--easing-standard)]"
              style={{
                opacity: i === index ? 1 : 0,
                animation: `zw-drift 20s ease-in-out infinite ${
                  i % 2 ? "alternate-reverse" : "alternate"
                }`,
              }}
            >
              <Image
                src={image.url}
                alt={image.altText}
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                priority={i === 0}
                className="object-cover"
              />
            </div>
          );
        })}
        {current && (
          <Link
            href={`/products/${current.slug}`}
            className="absolute bottom-0 left-0 flex items-baseline gap-3 bg-[var(--gray-100)] px-4.5 py-3.5 text-white transition-colors duration-150 hover:bg-[var(--magenta-60)] hover:no-underline"
          >
            <span className="font-mono text-[11px] tracking-[1.6px] uppercase">
              {current.name}
            </span>
            <span className="font-mono text-[13px] font-semibold text-[var(--yellow-30)]">
              {formatInr(current.price)}
            </span>
            <span className="font-mono text-[11px] tracking-[1.4px] text-[var(--gray-30)]">
              {String(index + 1).padStart(2, "0")} / {String(heroProducts.length).padStart(2, "0")}
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}
