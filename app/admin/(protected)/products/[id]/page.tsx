import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/products/product-form";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guard";
import { getAdminProductById } from "@/lib/supabase/queries/admin-products";
import { getActiveCategories } from "@/lib/supabase/queries/categories";
import { listSelectableAssets } from "@/lib/supabase/queries/admin-assets";
import {
  archiveProductAction,
  restoreProductAction,
} from "@/lib/admin/products/actions";

export const metadata: Metadata = { title: "Edit product" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  // Page-level gate. Each action re-authorizes independently.
  await requireAdmin();

  const { id } = await params;

  // Reject a malformed id here rather than sending it to the database.
  if (!UUID_PATTERN.test(id)) notFound();

  const [product, categories, assets, videoAssets, query] = await Promise.all([
    getAdminProductById(id),
    getActiveCategories(),
    listSelectableAssets("image"),
    listSelectableAssets("video"),
    searchParams,
  ]);

  if (!product) notFound();

  const justCreated = firstParam(query.created) === "1";
  const mediaFailed = firstParam(query.mediaError) === "1";
  const categoryFailed = firstParam(query.categoryError) === "1";

  return (
    <>
      <PageHeader
        title={product.name}
        description={`/products/${product.slug}`}
        action={
          <>
            <StatusBadge
              active={product.isActive}
              activeLabel="Live"
              inactiveLabel="Archived"
            />

            {product.isActive && (
              <Button
                variant="outline"
                render={
                  <Link href={`/products/${product.slug}`} target="_blank" rel="noreferrer" />
                }
              >
                View
              </Button>
            )}

            {product.isActive ? (
              <ConfirmAction
                action={archiveProductAction}
                hiddenFields={{ id: product.id }}
                title="Archive this product?"
                description={`"${product.name}" will be hidden from the public site straight away. You can restore it at any time.`}
                confirmLabel="Archive"
                destructive
                // The trigger crosses into a client component, so its type has
                // to be a host tag rather than a server-rendered component.
                trigger={
                  <button type="button" className={buttonVariants({ variant: "outline" })}>
                    Archive
                  </button>
                }
              />
            ) : (
              <ConfirmAction
                action={restoreProductAction}
                hiddenFields={{ id: product.id }}
                title="Restore this product?"
                description={`"${product.name}" will become visible on the public site again.`}
                confirmLabel="Restore"
                trigger={
                  <button type="button" className={buttonVariants({ variant: "outline" })}>
                    Restore
                  </button>
                }
              />
            )}

            <Button variant="ghost" render={<Link href="/admin/products" />}>
              Back
            </Button>
          </>
        }
      />

      {justCreated && !mediaFailed && !categoryFailed && (
        <p role="status" className="mt-4 border border-border bg-muted px-3 py-2 text-sm">
          Product created. You can keep editing it here.
        </p>
      )}

      {mediaFailed && (
        <p
          role="alert"
          className="mt-4 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          The product was created, but its images could not be attached. Please select the
          gallery images again and save.
        </p>
      )}

      {categoryFailed && (
        <p
          role="alert"
          className="mt-4 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          The product was created, but its categories could not be saved — it may not appear
          on the public site yet. Please choose its categories again.
        </p>
      )}

      <ProductForm
        mode="edit"
        product={product}
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
