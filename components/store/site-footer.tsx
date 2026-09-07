import Link from "next/link";
import { getCategoryAccent } from "@/lib/store/category-accent";
import type { DeliveryTerms } from "@/lib/store/delivery";
import type { Category } from "@/types/category";

/**
 * Site footer, built to the design reference (five stacked bands).
 *
 * Reference notes worth keeping in mind when editing:
 *   - The four link columns are separated by 1px *gaps* over a lighter
 *     background, not by borders. That is what produces the hairline rules.
 *   - The oversized wordmark is deliberately cropped by a negative bottom
 *     margin, and is decorative only.
 *   - "Shop by spot" is driven from the live category list, so a category added
 *     in the admin appears here automatically with its accent swatch.
 *
 * The reference is desktop-only (fixed 48px gutters, 4-column grid). Responsive
 * collapse is added here: the CTA stacks, and the columns go 4 -> 2 -> 1.
 */

/** Static facts about how ZWIK ships. Delivery cost is appended separately. */
const GOOD_TO_KNOW = [
  "Ships across India",
  "Free gift wrap and card",
  "Payment confirmed on WhatsApp",
];

export function SiteFooter({
  waLink,
  phoneLabel,
  categories,
  delivery,
  year,
}: {
  waLink: string | null;
  phoneLabel: string | null;
  categories: Category[];
  delivery: DeliveryTerms;
  /** Computed on the server so the markup stays deterministic. */
  year: number;
}) {
  // Degrade honestly rather than render a dead link (ARCHITECTURE.md §18).
  const ctaHref = waLink ?? "/contact";
  const ctaLabel = waLink ? "WhatsApp" : "Contact us";

  return (
    <footer className="bg-[var(--gray-100)] text-[var(--gray-30)]">
      {/* Band 1 — WhatsApp call to action. */}
      <div className="grid grid-cols-1 items-center gap-8 bg-[var(--magenta-60)] px-6 py-10 text-white md:grid-cols-[1.35fr_auto] md:px-12 md:py-11">
        <div>
          <div className="font-mono text-[11px] tracking-[2px] uppercase opacity-85">
            No forms, no accounts
          </div>
          <p className="mt-3 text-[clamp(28px,3.2vw,46px)] leading-[0.98] font-semibold tracking-[-0.035em]">
            Message us and we&rsquo;ll
            <br />
            pick something for you.
          </p>
        </div>
        <a
          href={ctaHref}
          {...(waLink ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="flex h-[62px] items-center justify-center gap-2 bg-white px-8.5 font-mono text-[13px] font-semibold tracking-[1.6px] whitespace-nowrap text-[var(--magenta-60)] uppercase transition-colors hover:bg-[var(--yellow-30)] hover:text-[var(--gray-100)] hover:no-underline"
        >
          <span>{ctaLabel}</span>
          {phoneLabel && waLink && <span>{phoneLabel}</span>}
          <span aria-hidden>&rarr;</span>
        </a>
      </div>

      {/* Band 2 — four columns. The 1px gap over gray-90 draws the rules. */}
      <div className="grid grid-cols-1 gap-px bg-[var(--gray-90)] sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="bg-[var(--gray-100)] px-6 pt-10 pb-9 md:px-12">
          <div className="flex items-center gap-2.5 font-mono text-[17px] leading-tight font-semibold tracking-[3px] text-white">
            <span className="block size-3 bg-[var(--magenta-60)]" aria-hidden />
            ZWIK
          </div>
          <p className="mt-4 max-w-[34ch] text-sm leading-[1.6]">
            Your own miniature world. Hand-painted resin decor for desks, monitors,
            dashboards, and shelves.
          </p>
          <div className="mt-5.5 flex gap-1.5" aria-hidden>
            <span className="block h-2 w-7.5 bg-[var(--magenta-60)]" />
            <span className="block h-2 w-7.5 bg-[var(--blue-60)]" />
            <span className="block h-2 w-7.5 bg-[var(--teal-60)]" />
            <span className="block h-2 w-7.5 bg-[var(--yellow-30)]" />
          </div>
        </div>

        <nav
          className="flex flex-col gap-2.5 bg-[var(--gray-100)] px-6 pt-10 pb-9 md:px-7"
          aria-label="Browse"
        >
          <span className="font-mono text-[11px] tracking-[1.6px] text-white uppercase">
            Browse
          </span>
          {[
            { href: "/products", label: "Catalog" },
            { href: "/bulk-gifting", label: "Bulk gifting" },
            { href: "/about", label: "About" },
            { href: "/contact", label: "Contact" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-[var(--gray-30)] transition-colors hover:text-[var(--yellow-30)] hover:no-underline"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <nav
          className="flex flex-col gap-2.5 bg-[var(--gray-100)] px-6 pt-10 pb-9 md:px-7"
          aria-label="Shop by spot"
        >
          <span className="font-mono text-[11px] tracking-[1.6px] text-white uppercase">
            Shop by spot
          </span>
          {categories.length === 0 ? (
            <Link
              href="/products"
              className="text-sm text-[var(--gray-30)] transition-colors hover:text-white hover:no-underline"
            >
              Browse the catalog
            </Link>
          ) : (
            categories.map((category) => (
              <Link
                key={category.slug}
                href={`/products?place=${category.slug}`}
                className="flex items-center gap-2.5 text-sm text-[var(--gray-30)] transition-colors hover:text-white hover:no-underline"
              >
                <span
                  aria-hidden
                  className="block size-2 shrink-0"
                  style={{ background: getCategoryAccent(category.slug).bg }}
                />
                {category.name}
              </Link>
            ))
          )}
        </nav>

        <div className="flex flex-col gap-2.5 bg-[var(--gray-100)] px-6 pt-10 pb-9 md:px-7">
          <span className="font-mono text-[11px] tracking-[1.6px] text-white uppercase">
            Good to know
          </span>
          {/* Delivery goes first when an offer is running — it is the line
              customers actually look for. Nothing is shown when none is set. */}
          {delivery.headline && (
            <span className="text-sm leading-[1.5] text-[var(--yellow-30)]">
              {delivery.headline}
            </span>
          )}
          {GOOD_TO_KNOW.map((line) => (
            <span key={line} className="text-sm leading-[1.5]">
              {line}
            </span>
          ))}
        </div>
      </div>

      {/*
        Band 3 — the signature colours and the oversized wordmark, drifting in
        opposite directions at deliberately different speeds: the strip is
        brisk, the wordmark is a slow ambient crawl. Reading the two against
        each other is the whole effect, so the speeds are meant to differ by a
        lot rather than a little.

        Both are decorative and aria-hidden — the wordmark repeats "ZWIK" a
        dozen times to fill the loop, which is meaningless to a screen reader.
        Both also freeze under prefers-reduced-motion via the global rule in
        globals.css; nothing extra is needed here.
      */}
      <div aria-hidden className="border-t border-[var(--gray-90)]">
        <div className="overflow-hidden py-5">
          <div
            className="h-2 w-[calc(100%+144px)] animate-[zw-swatch-drift_1.2s_linear_infinite] will-change-transform"
            style={{
              backgroundImage: `repeating-linear-gradient(
                90deg,
                var(--magenta-60) 0 30px,
                transparent 30px 36px,
                var(--blue-60) 36px 66px,
                transparent 66px 72px,
                var(--teal-60) 72px 102px,
                transparent 102px 108px,
                var(--yellow-30) 108px 138px,
                transparent 138px 144px
              )`,
            }}
          />
        </div>

        {/*
          `w-max` with two identical halves and a -50% translate is what makes
          the loop seamless. The trailing space is padding on each copy rather
          than a flex `gap`, so both halves are exactly the same width — with a
          gap between them, -50% lands half a gap off and the seam shows.
        */}
        <div className="overflow-hidden">
          {/* `reverse` is what sends the wordmark rightward, against the
              colour strip above it. zw-marquee itself must stay leftward —
              the header's announcement ticker shares it. */}
          <div className="flex w-max animate-[zw-marquee_80s_linear_infinite_reverse] will-change-transform">
            {[0, 1].map((half) => (
              <div key={half} className="flex shrink-0">
                {Array.from({ length: 8 }).map((_, i) => (
                  <span
                    key={i}
                    className="-mb-[0.16em] block pr-[0.18em] text-[clamp(72px,15.5vw,240px)] leading-[0.82] font-semibold tracking-[-0.06em] whitespace-nowrap text-white opacity-[0.09] select-none"
                  >
                    ZWIK
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Band 4 — legal bar. */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--gray-90)] px-6 pt-4.5 pb-6 font-mono text-[11px] tracking-[1.4px] text-[var(--gray-50)] uppercase md:px-12">
        <span>&copy; {year} ZWIK &middot; Your own miniature world</span>
        <span>Made in India</span>
      </div>
    </footer>
  );
}
