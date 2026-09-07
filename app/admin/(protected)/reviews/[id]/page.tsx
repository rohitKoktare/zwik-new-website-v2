import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { ReviewForm } from "@/components/admin/reviews/review-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guard";
import {
  getReviewById,
  listReviewProductOptions,
} from "@/lib/supabase/queries/admin-reviews";
import { listSelectableAssets } from "@/lib/supabase/queries/admin-assets";
import { uuidSchema } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Edit review" };

export default async function EditReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Page-level gate. updateReviewAction re-checks independently.
  await requireAdmin();

  const { id } = await params;

  // Route params are untrusted input; reject a malformed id before it reaches
  // the database (DEVELOPMENT_STANDARDS.md §7).
  if (!uuidSchema.safeParse(id).success) notFound();

  const review = await getReviewById(id);
  if (!review) notFound();

  const [products, assets] = await Promise.all([
    listReviewProductOptions(),
    listSelectableAssets("image"),
  ]);

  return (
    <>
      <PageHeader
        title="Edit review"
        description={`Feedback from ${review.customerDisplayName} about ${review.productName ?? "an unknown product"}.`}
        action={
          // Base UI composes via `render`, not Radix's `asChild`.
          <Button variant="outline" render={<Link href="/admin/reviews" />}>
            Back to reviews
          </Button>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge active={review.isActive} />
        <Badge variant={review.isFeatured ? "outline" : "secondary"}>
          {review.isFeatured ? "Featured" : "Not featured"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {review.isActive && review.isFeatured
            ? "Currently eligible for the homepage."
            : "Not shown on the homepage — that needs both active and featured."}
        </span>
      </div>

      <ReviewForm products={products} assets={assets} review={review} />
    </>
  );
}
