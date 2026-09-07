import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { FeaturedProductsPanel } from "@/components/admin/homepage/featured-products-panel";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  countFeaturedProducts,
  HERO_SLIDE_LIST_LIMIT,
  listFeaturedProductCandidates,
  listHeroSlidesForAdmin,
  type AdminHeroSlide,
} from "@/lib/supabase/queries/admin-hero-slides";
import {
  archiveHeroSlideAction,
  restoreHeroSlideAction,
} from "@/lib/admin/homepage/actions";
import { parsePagination, totalPages } from "@/lib/admin/pagination";
import { requireAdmin } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Homepage" };

/**
 * Schedule timestamps are stored in UTC and shown in UTC, matching the slide
 * form's inputs. A fixed locale and timeZone keep the rendered string
 * deterministic rather than dependent on the machine doing the rendering
 * (DATABASE_DESIGN.md §16).
 */
const SCHEDULE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatInstant(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return `${SCHEDULE_FORMATTER.format(new Date(ms))} UTC`;
}

function describeSchedule(slide: AdminHeroSlide): string {
  if (slide.startsAt && slide.endsAt) {
    return `${formatInstant(slide.startsAt)} → ${formatInstant(slide.endsAt)}`;
  }
  if (slide.startsAt) return `From ${formatInstant(slide.startsAt)}`;
  if (slide.endsAt) return `Until ${formatInstant(slide.endsAt)}`;
  return "No schedule — always eligible";
}

export default async function AdminHomepagePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; created?: string }>;
}) {
  // Page-level gate. Every action on this page re-checks independently.
  await requireAdmin();

  const params = await searchParams;
  const pagination = parsePagination({ page: params.page, pageSize: params.pageSize });

  const [slideList, productList, featuredCount] = await Promise.all([
    listHeroSlidesForAdmin(),
    listFeaturedProductCandidates({ pagination }),
    countFeaturedProducts(),
  ]);

  const pageCount = totalPages(productList.totalCount, pagination.pageSize);

  return (
    <>
      <PageHeader
        title="Homepage"
        description="Hero slides and featured products, as they appear on the public homepage."
        action={
          // Base UI composes via `render`, not Radix's `asChild`.
          <Button render={<Link href="/admin/homepage/slides/new" />}>New slide</Button>
        }
      />

      {params.created === "1" && (
        <p
          role="status"
          className="mt-6 border border-border bg-muted px-3 py-2 text-sm"
        >
          Slide created.
        </p>
      )}

      <section className="mt-8" aria-labelledby="hero-slides-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="hero-slides-heading" className="text-lg font-semibold tracking-tight">
            Hero slides
          </h2>
          <p className="text-xs text-muted-foreground">
            {slideList.totalCount} {slideList.totalCount === 1 ? "slide" : "slides"}, shown
            in sort order
          </p>
        </div>

        {slideList.truncated && (
          <p className="mt-2 border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            Showing the first {HERO_SLIDE_LIST_LIMIT} slides. A hero carousel this long is
            worth trimming — archive the ones you no longer use.
          </p>
        )}

        {slideList.slides.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No hero slides yet"
              description="Hero slides are the large panels at the top of the homepage. Add one to get started."
              action={
                <Button render={<Link href="/admin/homepage/slides/new" />}>
                  New slide
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mt-4 border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Image</TableHead>
                  <TableHead>Slide</TableHead>
                  <TableHead className="w-16">Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Schedule (UTC)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slideList.slides.map((slide) => (
                  <TableRow key={slide.id}>
                    <TableCell>
                      {slide.assetUrl ? (
                        <span className="relative block h-10 w-16 overflow-hidden bg-muted">
                          <Image
                            src={slide.assetUrl}
                            alt={slide.assetAltText ?? ""}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        </span>
                      ) : (
                        <span className="flex h-10 w-16 items-center justify-center border border-dashed border-border text-[10px] text-muted-foreground">
                          No image
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="max-w-xs">
                      <span className="block font-medium">{slide.heading}</span>
                      {slide.subheading && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {slide.subheading}
                        </span>
                      )}
                      {slide.ctaType && slide.ctaLabel && (
                        <span className="block text-xs text-muted-foreground">
                          Button: {slide.ctaLabel} ({slide.ctaType})
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="font-mono text-xs">{slide.sortOrder}</TableCell>

                    <TableCell>
                      <StatusBadge active={slide.isActive} activeLabel="Visible" />
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {describeSchedule(slide)}
                    </TableCell>

                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          render={<Link href={`/admin/homepage/slides/${slide.id}`} />}
                        >
                          Edit
                        </Button>

                        {slide.isActive ? (
                          <ConfirmAction
                            action={archiveHeroSlideAction}
                            hiddenFields={{ id: slide.id }}
                            trigger={
                              <Button variant="destructive" size="sm">
                                Hide
                              </Button>
                            }
                            title="Hide this slide?"
                            description={`“${slide.heading}” will stop appearing on the homepage. Nothing is deleted — you can make it visible again at any time.`}
                            confirmLabel="Hide slide"
                            destructive
                          />
                        ) : (
                          <ConfirmAction
                            action={restoreHeroSlideAction}
                            hiddenFields={{ id: slide.id }}
                            trigger={
                              <Button variant="outline" size="sm">
                                Restore
                              </Button>
                            }
                            title="Show this slide again?"
                            description={`“${slide.heading}” will appear on the homepage again, subject to its schedule.`}
                            confirmLabel="Restore slide"
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-12 border-t border-border pt-8" aria-labelledby="featured-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="featured-heading" className="text-lg font-semibold tracking-tight">
            Featured products
          </h2>
          <p className="text-xs text-muted-foreground">
            {featuredCount} currently featured across the catalogue
          </p>
        </div>

        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Featured products are highlighted on the homepage. Tick the ones to feature, then
          save.
        </p>

        <div className="mt-4 grid gap-4">
          <FeaturedProductsPanel products={productList.products} />

          <PaginationControls
            basePath="/admin/homepage"
            page={pagination.page}
            pageCount={pageCount}
            totalCount={productList.totalCount}
            searchParams={{ pageSize: params.pageSize }}
          />
        </div>
      </section>
    </>
  );
}
