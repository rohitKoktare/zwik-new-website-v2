import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { CategoryForm } from "@/components/admin/categories/category-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guard";
import { getCategoryById } from "@/lib/supabase/queries/admin-categories";
import { uuidSchema } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Edit category" };

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Page-level gate. updateCategoryAction re-checks independently.
  await requireAdmin();

  const { id } = await params;

  // Route params are untrusted input; reject a malformed id before it reaches
  // the database (DEVELOPMENT_STANDARDS.md §7).
  if (!uuidSchema.safeParse(id).success) notFound();

  const category = await getCategoryById(id);
  if (!category) notFound();

  return (
    <>
      <PageHeader
        title="Edit category"
        description={
          category.productCount === 0
            ? "No products use this category yet."
            : `${category.activeProductCount} of ${category.productCount} ${category.productCount === 1 ? "product" : "products"} in this category ${category.activeProductCount === 1 ? "is" : "are"} active.`
        }
        action={
          <div className="flex items-center gap-2">
            {/* The products list validates ?category= against active categories
                only, so this link would silently show everything for a hidden
                one. Offer it only when it actually filters. */}
            {category.isActive && category.productCount > 0 && (
              // Base UI composes via `render`, not Radix's `asChild`.
              <Button
                variant="outline"
                render={<Link href={`/admin/products?category=${category.id}`} />}
              >
                View products
              </Button>
            )}
            <Button variant="outline" render={<Link href="/admin/categories" />}>
              Back to categories
            </Button>
          </div>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge active={category.isActive} activeLabel="Visible" />
        <Badge variant="secondary">
          {category.productCount} {category.productCount === 1 ? "product" : "products"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {category.isActive
            ? category.activeProductCount > 0
              ? "Appears as a catalog filter on /products."
              : "Visible, but shows no products, so it is not a useful filter yet."
            : "Hidden — its products do not appear on the catalog either."}
        </span>
      </div>

      <CategoryForm category={category} />
    </>
  );
}
