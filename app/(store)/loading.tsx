import {
  LoadingShell,
  PageHeadingSkeleton,
  ProductGridSkeleton,
  Shimmer,
} from "@/components/store/skeleton";

/**
 * Home route loading state. Mirrors the hero split and the tile row, then a
 * strip of cards — the three blocks that dominate the page, so the layout does
 * not jump when the real content arrives.
 */
export default function HomeLoading() {
  return (
    <LoadingShell label="Loading the homepage">
      <section className="grid grid-cols-1 border-b border-[var(--gray-100)] md:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col justify-between gap-9 border-b border-[var(--gray-100)] px-6 py-12 md:border-r md:border-b-0 md:px-12 md:py-17">
          <div>
            <Shimmer className="h-6 w-72" />
            <Shimmer className="mt-6 h-[clamp(140px,20vw,300px)] w-full max-w-lg" />
            <Shimmer className="mt-7.5 h-16 w-full max-w-[44ch]" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Shimmer className="h-[54px] w-44" />
            <Shimmer className="h-[54px] w-44" />
          </div>
        </div>
        <Shimmer className="min-h-[360px] md:min-h-[540px]" />
      </section>

      <div className="grid grid-cols-2 gap-px border-b border-[var(--gray-100)] bg-[var(--gray-20)] md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Shimmer key={i} className="h-[200px]" />
        ))}
      </div>

      <div className="py-14 md:py-16">
        <PageHeadingSkeleton />
        <ProductGridSkeleton count={4} />
      </div>
    </LoadingShell>
  );
}
