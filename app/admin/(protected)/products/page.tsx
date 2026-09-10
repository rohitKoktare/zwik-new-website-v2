import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  listAdminProducts,
  type AdminProductStatusFilter,
} from "@/lib/supabase/queries/admin-products";
import { getActiveCategories } from "@/lib/supabase/queries/categories";
import {
  archiveProductAction,
  restoreProductAction,
} from "@/lib/admin/products/actions";

export const metadata: Metadata = { title: "Products" };

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_OPTIONS: { value: AdminProductStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Live" },
  { value: "archived", label: "Archived" },
];

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Query strings can repeat a key; take the first value and ignore the rest. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeStatus(value: string | undefined): AdminProductStatusFilter {
  return value === "active" || value === "archived" ? value : "all";
}

/**
 * Intl throws on a currency code it does not recognise, and older rows are not
 * guaranteed to hold a valid one — fall back rather than crash the whole list.
 */
function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Page-level gate. Each action re-authorizes independently.
  await requireAdmin();

  const params = await searchParams;
  const search = firstParam(params.q)?.trim() ?? "";
  const status = normalizeStatus(firstParam(params.status));
  const requestedCategory = firstParam(params.category) ?? "";
  const pagination = parsePagination({
    page: firstParam(params.page),
    pageSize: firstParam(params.pageSize),
  });

  const categories = await getActiveCategories();

  // Only filter by a category that actually exists, so a hand-edited query
  // string cannot reach the database as a malformed identifier.
  const categoryId = categories.some((category) => category.id === requestedCategory)
    ? requestedCategory
    : "";

  const { products, totalCount } = await listAdminProducts({
    pagination,
    status,
    categoryId: categoryId || undefined,
    search: search || undefined,
  });

  const pageCount = totalPages(totalCount, pagination.pageSize);
  const isFiltered = Boolean(search || categoryId || status !== "all");

  const preservedParams = {
    q: search || undefined,
    status: status !== "all" ? status : undefined,
    category: categoryId || undefined,
  };

  return (
    <>
      <PageHeader
        title="Products"
        description="Create, edit, feature and archive products. Archiving hides a product from the site without deleting it."
        action={
          <Button render={<Link href="/admin/products/new" />}>New product</Button>
        }
      />

      <form
        method="get"
        action="/admin/products"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <div className="grid gap-1.5">
          <label htmlFor="q" className="text-xs font-medium">
            Search
          </label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Name or SKU"
            className="w-56"
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="status" className="text-xs font-medium">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className={SELECT_CLASS}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="category" className="text-xs font-medium">
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={categoryId}
            className={SELECT_CLASS}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" variant="outline">
          Apply
        </Button>

        {isFiltered && (
          <Button variant="ghost" render={<Link href="/admin/products" />}>
            Clear
          </Button>
        )}
      </form>

      {products.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={isFiltered ? "No products match those filters" : "No products yet"}
            description={
              isFiltered
                ? "Try a different search term, status or category."
                : "Add your first product to start building the catalogue."
            }
            action={
              isFiltered ? (
                <Button variant="outline" render={<Link href="/admin/products" />}>
                  Clear filters
                </Button>
              ) : (
                <Button render={<Link href="/admin/products/new" />}>New product</Button>
              )
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {product.name}
                    </Link>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      /{product.slug}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {product.sku ?? <span className="text-muted-foreground">None</span>}
                  </TableCell>
                  <TableCell>
                    {product.categoryNames.length > 0 ? (
                      product.categoryNames.join(", ")
                    ) : (
                      <span className="text-muted-foreground">Uncategorised</span>
                    )}
                  </TableCell>
                  <TableCell>{formatPrice(product.price, product.currency)}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge
                        active={product.isActive}
                        activeLabel="Live"
                        inactiveLabel="Archived"
                      />
                      {product.isFeatured && <Badge variant="outline">Featured</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={`/admin/products/${product.id}`} />}
                      >
                        Edit
                      </Button>

                      {product.isActive ? (
                        <ConfirmAction
                          action={archiveProductAction}
                          hiddenFields={{ id: product.id }}
                          title="Archive this product?"
                          description={`"${product.name}" will be hidden from the public site straight away. You can restore it at any time.`}
                          confirmLabel="Archive"
                          destructive
                          // A plain element: the trigger crosses into a client
                          // component, so its type has to be a host tag.
                          trigger={
                            <button
                              type="button"
                              className={buttonVariants({ variant: "outline", size: "sm" })}
                            >
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
                            <button
                              type="button"
                              className={buttonVariants({ variant: "outline", size: "sm" })}
                            >
                              Restore
                            </button>
                          }
                        />
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <PaginationControls
            basePath="/admin/products"
            page={pagination.page}
            pageCount={pageCount}
            totalCount={totalCount}
            searchParams={preservedParams}
          />
        </div>
      )}
    </>
  );
}
