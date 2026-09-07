import { Reveal } from "@/components/store/reveal";
import type { Review } from "@/types/review";

export function ReviewsSection({ reviews }: { reviews: Review[] }) {
  return (
    <section className="border-b border-[var(--gray-100)] px-6 py-14 md:px-12 md:py-16">
      <Reveal className="flex items-end justify-between gap-6 border-b border-[var(--gray-100)] pb-4.5">
        <h2 className="text-[44px] leading-[1.02] font-semibold tracking-[-0.035em]">
          What people say
        </h2>
      </Reveal>

      {reviews.length === 0 ? (
        <p className="mt-7 text-[var(--text-secondary)]">No reviews yet — check back soon.</p>
      ) : (
        <div className="mt-7 grid grid-cols-1 gap-px border border-[var(--gray-20)] bg-[var(--gray-20)] md:grid-cols-3">
          {/*
            Each card is staggered, as in the design reference (its `r.delay`).
            Reveal is the grid item, so it stretches; the figure fills it with
            h-full, which keeps the 1px gap reading as a hairline rule.
          */}
          {reviews.map((review, index) => (
            <Reveal key={review.id} delayMs={index * 120}>
              <figure className="m-0 flex h-full min-h-[260px] flex-col justify-between gap-5.5 bg-white p-6">
                <div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className="block h-2.5 w-2.5"
                        style={{
                          background:
                            star <= review.rating ? "var(--magenta-60)" : "var(--gray-20)",
                        }}
                        aria-hidden
                      />
                    ))}
                  </div>
                  <blockquote className="mt-4.5 text-[17px] leading-snug font-medium">
                    {review.reviewText}
                  </blockquote>
                </div>
                <figcaption className="flex items-baseline justify-between gap-2.5 border-t border-[var(--gray-20)] pt-4 font-mono text-[11px] tracking-[1.4px] uppercase">
                  <span>{review.customerDisplayName}</span>
                  <span className="text-[var(--text-secondary)]">{review.source}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}
