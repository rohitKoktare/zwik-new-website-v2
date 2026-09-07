import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { AssetUploadForm } from "@/components/admin/assets/asset-upload-form";
import { AssetGrid, type AssetGridItem } from "@/components/admin/assets/asset-grid";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DESTRUCTIVE_ROLES, requireAdmin } from "@/lib/auth/guard";
import { parsePagination, totalPages } from "@/lib/admin/pagination";
import {
  countAssetReferences,
  formatFileSize,
  listAssets,
} from "@/lib/supabase/queries/admin-assets";

export const metadata: Metadata = { title: "Assets" };

const BASE_PATH = "/admin/assets";

/** A grid of 12 divides evenly across the 2- and 3-column breakpoints. */
const GRID_PAGE_SIZE = "12";

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type AssetsSearchParams = {
  page?: string | string[];
  pageSize?: string | string[];
  status?: string | string[];
  mediaType?: string | string[];
};

/** Query values can repeat; take the first and ignore the rest. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseStatus(value: string | undefined): "active" | "archived" | undefined {
  return value === "active" || value === "archived" ? value : undefined;
}

function parseMediaType(value: string | undefined): "image" | "video" | undefined {
  return value === "image" || value === "video" ? value : undefined;
}

export default async function AdminAssetsPage({
  searchParams,
}: {
  searchParams: Promise<AssetsSearchParams>;
}) {
  // Page-level gate. Every action below re-authorizes on its own.
  const profile = await requireAdmin();
  const params = await searchParams;

  const status = parseStatus(firstValue(params.status));
  const mediaType = parseMediaType(firstValue(params.mediaType));

  const pagination = parsePagination({
    page: firstValue(params.page),
    pageSize: firstValue(params.pageSize) ?? GRID_PAGE_SIZE,
  });

  const { assets, totalCount } = await listAssets({ pagination, status, mediaType });

  // One reference count per asset on the page. Bounded by the page size and
  // issued in parallel; the counts are needed up front so the archive and
  // delete confirmations can state exactly what is still using the file.
  const references = await Promise.all(
    assets.map((asset) => countAssetReferences(asset.id)),
  );

  const items: AssetGridItem[] = assets.map((asset, index) => ({
    asset,
    sizeLabel: formatFileSize(asset.fileSizeBytes),
    references: references[index],
  }));

  const canDelete = (DESTRUCTIVE_ROLES as readonly string[]).includes(profile.role);
  const isFiltered = status !== undefined || mediaType !== undefined;

  return (
    <>
      <PageHeader
        title="Assets"
        description="Images and video used across the storefront. Files are stored in Supabase Storage; this list holds their details."
      />

      <section className="mt-6 border border-border p-4" aria-labelledby="upload-heading">
        <h2 id="upload-heading" className="text-sm font-semibold tracking-tight">
          Upload media
        </h2>
        <p className="mt-1 mb-4 max-w-prose text-xs text-muted-foreground">
          Uploads are checked against the file&apos;s actual contents, not just its name.
        </p>
        <AssetUploadForm />
      </section>

      <section className="mt-8" aria-labelledby="library-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="library-heading" className="text-sm font-semibold tracking-tight">
            Media library
          </h2>

          {/* Plain GET form: filtering stays a Server Component concern and the
              filtered view keeps a shareable URL. */}
          <form method="get" action={BASE_PATH} className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="status" className="text-xs">
                Status
              </Label>
              <select
                id="status"
                name="status"
                defaultValue={status ?? ""}
                className={SELECT_CLASS}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="mediaType" className="text-xs">
                Type
              </Label>
              <select
                id="mediaType"
                name="mediaType"
                defaultValue={mediaType ?? ""}
                className={SELECT_CLASS}
              >
                <option value="">All types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
              </select>
            </div>

            <Button type="submit" variant="outline" size="sm">
              Apply
            </Button>

            {/* Base UI composes via `render`, not Radix's `asChild`. */}
            {isFiltered && (
              <Button variant="ghost" size="sm" render={<Link href={BASE_PATH} />}>
                Clear
              </Button>
            )}
          </form>
        </div>

        <div className="mt-4 grid gap-4">
          {items.length === 0 ? (
            <EmptyState
              title={isFiltered ? "No media matches these filters" : "No media yet"}
              description={
                isFiltered
                  ? "Try a different status or type, or clear the filters to see everything."
                  : "Upload an image or video above and it will appear here, ready to attach to products, hero slides and reviews."
              }
              action={
                isFiltered ? (
                  <Button variant="outline" size="sm" render={<Link href={BASE_PATH} />}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <AssetGrid items={items} canDelete={canDelete} />
          )}

          <PaginationControls
            basePath={BASE_PATH}
            page={pagination.page}
            pageCount={totalPages(totalCount, pagination.pageSize)}
            totalCount={totalCount}
            searchParams={{ status, mediaType }}
          />
        </div>
      </section>
    </>
  );
}
