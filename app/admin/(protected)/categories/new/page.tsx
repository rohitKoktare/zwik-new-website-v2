import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { CategoryForm } from "@/components/admin/categories/category-form";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Add category" };

export default async function NewCategoryPage() {
  // Page-level gate. createCategoryAction re-checks independently.
  await requireAdmin();

  return (
    <>
      <PageHeader
        title="Add category"
        description="A place a piece is made for. Categories are the catalog filters on the storefront, and every product must belong to one."
        action={
          // Base UI composes via `render`, not Radix's `asChild`.
          <Button variant="outline" render={<Link href="/admin/categories" />}>
            Back to categories
          </Button>
        }
      />

      <CategoryForm />
    </>
  );
}
