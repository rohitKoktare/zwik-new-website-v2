import { LoadingShell, Shimmer } from "@/components/store/skeleton";

/** Editorial route loading state: heading, then stacked prose blocks. */
export default function Loading() {
  return (
    <LoadingShell label="Loading the about page">
      <div className="px-6 py-14 md:px-12 md:py-16">
        <div className="border-b border-[var(--gray-100)] pb-4.5">
          <Shimmer className="h-11 w-2/3 max-w-md" />
        </div>
        <div className="mt-7 grid gap-4">
          <Shimmer className="h-4 w-full max-w-[60ch]" />
          <Shimmer className="h-4 w-full max-w-[58ch]" />
          <Shimmer className="h-4 w-full max-w-[52ch]" />
        </div>
        <Shimmer className="mt-9 h-[280px] w-full" />
      </div>
    </LoadingShell>
  );
}
