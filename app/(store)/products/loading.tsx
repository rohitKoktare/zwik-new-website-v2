import {
  LoadingShell,
  PageHeadingSkeleton,
  ProductGridSkeleton,
  Shimmer,
} from "@/components/store/skeleton";

/** Catalog loading state: heading, the category filter row, then the grid. */
export default function ProductsLoading() {
  return (
    <LoadingShell label="Loading the catalog">
      <section className="py-14 md:py-16">
        <PageHeadingSkeleton />

        <div className="mx-6 mb-8 flex flex-wrap gap-2 md:mx-12">
          {Array.from({ length: 4 }, (_, i) => (
            <Shimmer key={i} className="h-9 w-28" />
          ))}
        </div>

        <ProductGridSkeleton count={8} />
      </section>
    </LoadingShell>
  );
}
