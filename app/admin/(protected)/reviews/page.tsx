import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guard";
import { parsePagination, totalPages } from "@/lib/admin/pagination";
import { archiveReviewAction, restoreReviewAction } from "@/lib/admin/reviews/actions";
import {
  listReviewProductOptions,
  listReviewsForAdmin,
  parseReviewStatusFilter,
} from "@/lib/supabase/queries/admin-reviews";
import { reviewSourceLabel } from "@/lib/validation/review";
import { uuidSchema } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Reviews" };

const REVIEWS_PATH = "/admin/reviews";

/** Native select styled to match components/ui/input. */
const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "hidden", label: "Hidden (archived)" },
  { value: "featured", label: "Featured" },
];

type ReviewsSearchParams = {
  page?: string;
  pageSize?: string;
  product?: string;
  status?: string;
  saved?: string;
};

function truncate(text: string, limit = 160): string {
  return text.length <= limit ? text : `${text.slice(0, limit).trimEnd()}…`;
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<ReviewsSearchParams>;
}) {
  // Page-level gate. Every action re-checks independently.
  await requireAdmin();

  const params = await searchParams;

  // Query params are untrusted input (DEVELOPMENT_STANDARDS.md §7).
  const pagination = parsePagination(params);
  const status = parseReviewStatusFilter(params.status);
  const productId = uuidSchema.safeParse(params.product).success ? params.product : undefined;

  const [{ reviews, totalCount }, products] = await Promise.all([
    listReviewsForAdmin({ pagination, productId, status }),
    // Includes hidden products so their reviews stay findable.
    listReviewProductOptions({ activeOnly: false }),
  ]);

  const pageCount = totalPages(totalCount, pagination.pageSize);
  const hasFilters = Boolean(productId || status);

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Real customer feedback published on the site. ZWIK cannot confirm a purchase — ordering happens over WhatsApp — so every review must be genuine and attributed to the channel it actually came from."
        action={
          // Base UI composes via `render`, not Radix's `asChild`.
          <Button render={<Link href={`${REVIEWS_PATH}/new`} />}>Add review</Button>
        }
      />

      {params.saved === "created" && (
        <p role="status" className="mt-4 border border-border bg-muted px-3 py-2 text-sm">
          Review created. Only reviews that are both active and featured appear on the
          homepage.
        </p>
      )}

      <form method="get" action={REVIEWS_PATH} className="mt-6 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="product">Product</Label>
          <select
            id="product"
            name="product"
            defaultValue={productId ?? ""}
            className={`${SELECT_CLASS} sm:w-56`}
          >
            <option value="">All products</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
                {product.isActive ? "" : " (hidden)"}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className={`${SELECT_CLASS} sm:w-44`}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" variant="outline">
          Apply filters
        </Button>

        {hasFilters && (
          <Button variant="ghost" render={<Link href={REVIEWS_PATH} />}>
            Clear
          </Button>
        )}
      </form>

      {reviews.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={hasFilters ? "No reviews match these filters" : "No reviews yet"}
            description={
              hasFilters
                ? "Try a different product or status."
                : "Add a review once a customer sends you feedback. Nothing is seeded — the homepage simply shows no reviews until you add one."
            }
            action={
              hasFilters ? (
                <Button variant="outline" render={<Link href={REVIEWS_PATH} />}>
                  Clear filters
                </Button>
              ) : (
                <Button render={<Link href={`${REVIEWS_PATH}/new`} />}>Add review</Button>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-6 border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell className="font-medium">
                      {review.customerDisplayName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {review.productName ?? "Unknown product"}
                    </TableCell>
                    <TableCell>{review.rating.toFixed(1)} / 5</TableCell>
                    <TableCell className="text-muted-foreground">
                      {reviewSourceLabel(review.source)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge active={review.isActive} />
                        {review.isFeatured && <Badge variant="outline">Featured</Badge>}
                        {review.isFeatured && !review.isActive && (
                          <span className="text-xs text-muted-foreground">
                            not on homepage
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-normal text-muted-foreground">
                      {truncate(review.reviewText)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          render={<Link href={`${REVIEWS_PATH}/${review.id}`} />}
                        >
                          Edit
                        </Button>

                        {review.isActive ? (
                          <ConfirmAction
                            action={archiveReviewAction}
                            hiddenFields={{ id: review.id }}
                            trigger={
                              <Button variant="outline" size="sm">
                                Archive
                              </Button>
                            }
                            title="Archive this review?"
                            description={`The review from ${review.customerDisplayName} will stop appearing on the site. Nothing is deleted — you can restore it later.`}
                            confirmLabel="Archive review"
                          />
                        ) : (
                          <ConfirmAction
                            action={restoreReviewAction}
                            hiddenFields={{ id: review.id }}
                            trigger={
                              <Button variant="outline" size="sm">
                                Restore
                              </Button>
                            }
                            title="Restore this review?"
                            description={`The review from ${review.customerDisplayName} becomes visible again. It only returns to the homepage if it is also featured.`}
                            confirmLabel="Restore review"
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4">
            <PaginationControls
              basePath={REVIEWS_PATH}
              page={pagination.page}
              pageCount={pageCount}
              totalCount={totalCount}
              searchParams={{ product: productId, status, pageSize: params.pageSize }}
            />
          </div>
        </>
      )}
    </>
  );
}
