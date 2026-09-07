import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { HeroSlideForm } from "@/components/admin/homepage/hero-slide-form";
import { getHeroSlideById } from "@/lib/supabase/queries/admin-hero-slides";
import { listSelectableAssets } from "@/lib/supabase/queries/admin-assets";
import { uuidSchema } from "@/lib/validation/common";
import { requireAdmin } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Edit hero slide" };

export default async function EditHeroSlidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Page-level gate. updateHeroSlideAction re-checks independently.
  await requireAdmin();

  const { id } = await params;

  // Route params are untrusted input (DEVELOPMENT_STANDARDS.md §7). Checking
  // the shape here keeps a malformed id out of the query entirely.
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const [slide, assets] = await Promise.all([
    getHeroSlideById(parsedId.data),
    listSelectableAssets("image"),
  ]);

  if (!slide) notFound();

  return (
    <>
      <PageHeader
        title="Edit hero slide"
        description={
          slide.isActive
            ? "This slide is visible on the homepage, subject to its schedule."
            : "This slide is hidden and does not appear on the homepage."
        }
      />
      <HeroSlideForm mode="edit" slide={slide} assets={assets} />
    </>
  );
}
