import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ReviewForm } from "@/components/admin/reviews/review-form";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guard";
import { listReviewProductOptions } from "@/lib/supabase/queries/admin-reviews";
import { listSelectableAssets } from "@/lib/supabase/queries/admin-assets";

export const metadata: Metadata = { title: "Add review" };

export default async function NewReviewPage() {
  // Page-level gate. createReviewAction re-checks independently.
  await requireAdmin();

  const [products, assets] = await Promise.all([
    listReviewProductOptions(),
    listSelectableAssets("image"),
  ]);

  return (
    <>
      <PageHeader
        title="Add review"
        description="Record feedback a real customer actually gave, attributed to the channel it came from."
        action={
          // Base UI composes via `render`, not Radix's `asChild`.
          <Button variant="outline" render={<Link href="/admin/reviews" />}>
            Back to reviews
          </Button>
        }
      />

      {products.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No active products to review"
            description="Every review is attached to a product. Add or activate a product first, then come back."
            action={
              <Button variant="outline" render={<Link href="/admin/products" />}>
                Go to products
              </Button>
            }
          />
        </div>
      ) : (
        <ReviewForm products={products} assets={assets} />
      )}
    </>
  );
}
