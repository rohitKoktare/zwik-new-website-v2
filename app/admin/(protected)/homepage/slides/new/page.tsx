import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { HeroSlideForm } from "@/components/admin/homepage/hero-slide-form";
import { listSelectableAssets } from "@/lib/supabase/queries/admin-assets";
import { requireAdmin } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "New hero slide" };

export default async function NewHeroSlidePage() {
  // Page-level gate. createHeroSlideAction re-checks independently.
  await requireAdmin();

  // Images only — a hero slide is a still panel, not a video player.
  const assets = await listSelectableAssets("image");

  return (
    <>
      <PageHeader
        title="New hero slide"
        description="Slides appear at the top of the homepage, in sort order."
      />
      <HeroSlideForm mode="create" assets={assets} />
    </>
  );
}
