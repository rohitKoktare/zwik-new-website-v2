import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Server-rendered pagination. Uses links rather than client state so admin
 * list pages stay Server Components and pages stay shareable/bookmarkable.
 */
export function PaginationControls({
  basePath,
  page,
  pageCount,
  totalCount,
  searchParams,
}: {
  basePath: string;
  page: number;
  pageCount: number;
  totalCount: number;
  /** Existing query params to preserve (filters, search) when changing page. */
  searchParams?: Record<string, string | undefined>;
}) {
  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (value !== undefined && value !== "" && key !== "page") params.set(key, value);
    }
    if (targetPage > 1) params.set("page", String(targetPage));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  if (pageCount <= 1) {
    return (
      <p className="text-xs text-muted-foreground">
        {totalCount} {totalCount === 1 ? "item" : "items"}
      </p>
    );
  }

  const atStart = page <= 1;
  const atEnd = page >= pageCount;

  return (
    <nav className="flex items-center justify-between gap-4" aria-label="Pagination">
      <p className="text-xs text-muted-foreground">
        Page {page} of {pageCount} · {totalCount} {totalCount === 1 ? "item" : "items"}
      </p>
      <div className="flex items-center gap-2">
        {atStart ? (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        ) : (
          // Base UI composes via `render`, not Radix's `asChild`.
          <Button variant="outline" size="sm" render={<Link href={buildHref(page - 1)} rel="prev" />}>
            Previous
          </Button>
        )}

        {atEnd ? (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        ) : (
          <Button variant="outline" size="sm" render={<Link href={buildHref(page + 1)} rel="next" />}>
            Next
          </Button>
        )}
      </div>
    </nav>
  );
}
