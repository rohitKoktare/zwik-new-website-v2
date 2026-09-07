import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DESTRUCTIVE_ROLES, requireAdmin, type AdminRole } from "@/lib/auth/guard";
import { parsePagination, totalPages } from "@/lib/admin/pagination";
import {
  archiveCategoryAction,
  deleteCategoryAction,
  restoreCategoryAction,
} from "@/lib/admin/categories/actions";
import {
  listCategoriesForAdmin,
  parseCategoryStatusFilter,
} from "@/lib/supabase/queries/admin-categories";
import { CATEGORY_ACCENTS } from "@/lib/store/category-accent";

export const metadata: Metadata = { title: "Categories" };

const CATEGORIES_PATH = "/admin/categories";

/** Native select styled to match components/ui/input. */
const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Visible" },
  { value: "hidden", label: "Hidden" },
  { value: "empty", label: "No products" },
];

type CategoriesSearchParams = {
  page?: string;
  pageSize?: string;
  status?: string;
  q?: string;
  saved?: string;
};

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<CategoriesSearchParams>;
}) {
  // Page-level gate. Every action re-checks independently.
  const profile = await requireAdmin();

  const params = await searchParams;

  // Query params are untrusted input (DEVELOPMENT_STANDARDS.md §7).
  const pagination = parsePagination(params);
  const status = parseCategoryStatusFilter(params.status);
  const search = params.q?.trim().slice(0, 80) || undefined;

  const { categories, totalCount } = await listCategoriesForAdmin({
    pagination,
    status,
    search,
  });

  const pageCount = totalPages(totalCount, pagination.pageSize);
  const hasFilters = Boolean(status || search);

  // Deleting is permanent, so the control is only rendered for roles allowed to
  // do it. deleteCategoryAction re-checks the role itself — this only avoids
  // showing a button that would be refused.
  const canDelete = DESTRUCTIVE_ROLES.includes(profile.role as AdminRole);

  return (
    <>
      <PageHeader
        title="Categories"
        description="The places a piece is made for — desk, monitor, dashboard, shelf. Each category is a catalog filter on the storefront, and every product must belong to one."
        action={
          // Base UI composes via `render`, not Radix's `asChild`.
          <Button render={<Link href={`${CATEGORIES_PATH}/new`} />}>Add category</Button>
        }
      />

      {params.saved === "created" && (
        <p role="status" className="mt-4 border border-border bg-muted px-3 py-2 text-sm">
          Category created. A category only appears as a catalog filter once it has at least
          one active product.
        </p>
      )}

      <form method="get" action={CATEGORIES_PATH} className="mt-6 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Name or slug"
            className="sm:w-56"
          />
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
          <Button variant="ghost" render={<Link href={CATEGORIES_PATH} />}>
            Clear
          </Button>
        )}
      </form>

      {categories.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={hasFilters ? "No categories match these filters" : "No categories yet"}
            description={
              hasFilters
                ? "Try a different search or status."
                : "Products cannot be created without a category, so add one first. A product with no category never appears on the public site."
            }
            action={
              hasFilters ? (
                <Button variant="outline" render={<Link href={CATEGORIES_PATH} />}>
                  Clear filters
                </Button>
              ) : (
                <Button render={<Link href={`${CATEGORIES_PATH}/new`} />}>
                  Add category
                </Button>
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
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => {
                  const accent = CATEGORY_ACCENTS[category.slug];

                  return (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="inline-block size-3 shrink-0 border border-border"
                            style={{ background: accent?.bg ?? "var(--gray-100)" }}
                          />
                          {category.name}
                        </span>
                        {!accent && (
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                            no brand accent for this slug
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {category.slug}
                      </TableCell>

                      <TableCell>
                        {category.productCount === 0 ? (
                          <span className="text-muted-foreground">None</span>
                        ) : (
                          <span>
                            {category.activeProductCount} active
                            {category.productCount !== category.activeProductCount && (
                              <span className="text-muted-foreground">
                                {" "}
                                / {category.productCount} total
                              </span>
                            )}
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge active={category.isActive} activeLabel="Visible" />
                          {!category.isActive && category.activeProductCount > 0 && (
                            <Badge variant="outline">
                              {category.activeProductCount} product
                              {category.activeProductCount === 1 ? "" : "s"} hidden with it
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {category.sortOrder}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            render={<Link href={`${CATEGORIES_PATH}/${category.id}`} />}
                          >
                            Edit
                          </Button>

                          {category.isActive ? (
                            <ConfirmAction
                              action={archiveCategoryAction}
                              hiddenFields={{ id: category.id }}
                              trigger={
                                <Button variant="outline" size="sm">
                                  Hide
                                </Button>
                              }
                              title={`Hide "${category.name}"?`}
                              description={
                                category.activeProductCount > 0
                                  ? `It stops appearing as a catalog filter, and because the catalog only shows products whose category is visible, its ${category.activeProductCount} active product${category.activeProductCount === 1 ? "" : "s"} will disappear from the storefront too. Nothing is deleted — you can make it visible again.`
                                  : "It stops appearing as a catalog filter. Nothing is deleted — you can make it visible again."
                              }
                              confirmLabel="Hide category"
                            />
                          ) : (
                            <ConfirmAction
                              action={restoreCategoryAction}
                              hiddenFields={{ id: category.id }}
                              trigger={
                                <Button variant="outline" size="sm">
                                  Show
                                </Button>
                              }
                              title={`Make "${category.name}" visible?`}
                              description={
                                category.activeProductCount > 0
                                  ? `It returns to the catalog filters, along with its ${category.activeProductCount} active product${category.activeProductCount === 1 ? "" : "s"}.`
                                  : "It becomes visible, but a category with no active products does not show up as a catalog filter."
                              }
                              confirmLabel="Make visible"
                            />
                          )}

                          {/* Only offered when nothing references it — the FK is
                              `on delete restrict`, so a delete would be refused. */}
                          {canDelete && category.productCount === 0 && (
                            <ConfirmAction
                              action={deleteCategoryAction}
                              hiddenFields={{ id: category.id }}
                              trigger={
                                <Button variant="outline" size="sm">
                                  Delete
                                </Button>
                              }
                              title={`Delete "${category.name}" permanently?`}
                              description="No products use this category, so it can be removed for good. This cannot be undone — hide it instead if you might want it back."
                              confirmLabel="Delete permanently"
                              destructive
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4">
            <PaginationControls
              basePath={CATEGORIES_PATH}
              page={pagination.page}
              pageCount={pageCount}
              totalCount={totalCount}
              searchParams={{ status, q: search, pageSize: params.pageSize }}
            />
          </div>
        </>
      )}
    </>
  );
}
