import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/products/product-form";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guard";
import { getActiveCategories } from "@/lib/supabase/queries/categories";
import { listSelectableAssets } from "@/lib/supabase/queries/admin-assets";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  // Page-level gate. createProductAction re-authorizes independently.
  await requireAdmin();

  const [categories, assets, videoAssets] = await Promise.all([
    getActiveCategories(),
    listSelectableAssets("image"),
    listSelectableAssets("video"),
  ]);

  return (
    <>
      <PageHeader
        title="New product"
        description="A new product is live as soon as it is saved unless you switch it to archived."
        action={
          <Button variant="outline" render={<Link href="/admin/products" />}>
            Back to products
          </Button>
        }
      />

      <ProductForm
        mode="create"
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
        }))}
        assets={assets}
        videoAssets={videoAssets}
      />
    </>
  );
}
