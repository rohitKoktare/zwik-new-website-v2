import { LoadingShell, Shimmer } from "@/components/store/skeleton";

/**
 * Product detail loading state.
 *
 * The gallery placeholder is capped at the same 560px as the real one
 * (components/store/product-gallery.tsx), so the panel beside it does not
 * reflow when the product arrives.
 */
export default function ProductLoading() {
  return (
    <LoadingShell label="Loading this product">
      <div className="flex items-center gap-2.5 border-b border-[var(--gray-20)] px-6 py-3.5 md:px-12">
        <Shimmer className="h-3.5 w-56" />
      </div>

      <section className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr]">
        <div className="min-w-0 border-[var(--gray-20)] md:border-r">
          <div
            className="mx-auto w-full px-6 py-6 md:px-8"
            style={{ maxWidth: "calc(min(100%, 560px) + 4rem)" }}
          >
            <Shimmer
              className="mx-auto aspect-square w-full"
              // Matches MAX_FRAME in product-gallery.tsx.
            />
            <div className="mt-px flex gap-px">
              {Array.from({ length: 4 }, (_, i) => (
                <Shimmer key={i} className="size-20 flex-none" />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6.5 px-6 py-10 md:px-12 md:pb-12">
          <div>
            <Shimmer className="h-6 w-28" />
            <Shimmer className="mt-4.5 h-[clamp(60px,8vw,110px)] w-full max-w-md" />
            <Shimmer className="mt-4 h-9 w-40" />
            <Shimmer className="mt-5 h-20 w-full max-w-[48ch]" />
          </div>
          <Shimmer className="h-14 w-full" />
          <Shimmer className="h-40 w-full" />
        </div>
      </section>
    </LoadingShell>
  );
}
