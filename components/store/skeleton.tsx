/**
 * Loading primitives shared by every `loading.tsx`.
 *
 * These are Server Components with no client JS: a route's loading state must
 * be renderable before any bundle arrives, which is the whole point of it.
 *
 * The shimmer is a plain opacity pulse rather than a travelling gradient — it
 * reads as "waiting" without implying progress, and it costs one animated
 * property. It resolves to a static block under `prefers-reduced-motion` via
 * the global rule in globals.css.
 *
 * Skeletons mirror the real layout's *boxes*, not its details. A skeleton that
 * tries to be a wireframe of the finished page shifts more on hydration, not
 * less.
 */

export function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse bg-[var(--gray-10)] ${className}`}
    />
  );
}

/**
 * Wraps a route's skeleton. Announces the wait once, politely, and hides the
 * decorative boxes from assistive tech — a screen reader should hear "Loading",
 * not a list of empty regions.
 */
export function LoadingShell({
  label,
  children,
}: {
  /** e.g. "Loading the catalog". */
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p role="status" aria-live="polite" className="sr-only">
        {label}
      </p>
      <div aria-hidden>{children}</div>
    </div>
  );
}

/** Catalog/related-products grid placeholder. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="mx-6 grid grid-cols-1 gap-px sm:grid-cols-2 md:mx-12 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border border-[var(--gray-20)] bg-white">
          <Shimmer className="aspect-square w-full" />
          <div className="p-4">
            <div className="flex min-h-[46px] items-start justify-between gap-3">
              <Shimmer className="h-5 w-3/5" />
              <Shimmer className="h-5 w-16" />
            </div>
          </div>
          <Shimmer className="mx-4 mb-4 h-10 w-[calc(100%-2rem)]" />
        </div>
      ))}
    </div>
  );
}

/** Heading block used at the top of most routes. */
export function PageHeadingSkeleton() {
  return (
    <div className="mx-6 mb-6 border-b border-[var(--gray-100)] pb-4.5 md:mx-12">
      <Shimmer className="h-11 w-2/3 max-w-md" />
      <Shimmer className="mt-2.5 h-3.5 w-40" />
    </div>
  );
}
