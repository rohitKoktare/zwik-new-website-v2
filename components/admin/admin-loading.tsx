/**
 * Admin loading primitives. Server Components with no client JS — a loading
 * state has to render before any bundle arrives.
 *
 * Every admin route is dynamic (`ƒ` in the build output) because it is
 * authenticated, so these are seen on every navigation, not just a cold cache.
 */

export function AdminShimmer({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse bg-muted ${className}`} />;
}

export function AdminLoadingShell({
  label,
  children,
}: {
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

/** Mirrors components/admin/page-header.tsx. */
export function AdminHeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
      <div className="w-full max-w-lg">
        <AdminShimmer className="h-8 w-48" />
        <AdminShimmer className="mt-2 h-4 w-full max-w-prose" />
      </div>
      <AdminShimmer className="h-9 w-32" />
    </div>
  );
}

/** Filter bar plus a table body — the shape of every admin list route. */
export function AdminTableSkeleton({
  columns = 5,
  rows = 6,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <>
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <AdminShimmer className="h-8 w-56" />
        <AdminShimmer className="h-8 w-44" />
        <AdminShimmer className="h-8 w-28" />
      </div>

      <div className="mt-6 border border-border">
        <div className="flex gap-4 border-b border-border bg-muted/50 px-4 py-2.5">
          {Array.from({ length: columns }, (_, i) => (
            <AdminShimmer key={i} className="h-3.5 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex gap-4 border-b border-border px-4 py-3.5 last:border-b-0">
            {Array.from({ length: columns }, (_, c) => (
              <AdminShimmer key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>

      <AdminShimmer className="mt-4 h-4 w-32" />
    </>
  );
}

/** Stacked field rows — the shape of every admin create/edit route. */
export function AdminFormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="mt-6 grid max-w-2xl gap-6">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="grid gap-1.5">
          <AdminShimmer className="h-4 w-32" />
          <AdminShimmer className="h-8 w-full" />
          <AdminShimmer className="h-3 w-2/3" />
        </div>
      ))}
      <AdminShimmer className="h-9 w-36" />
    </div>
  );
}
