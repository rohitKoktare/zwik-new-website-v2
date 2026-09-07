import { HeroSection } from "@/sections/home/hero-section";
import { CategoryTilesSection, type CategoryTile } from "@/sections/home/category-tiles-section";
import { CatalogStripSection } from "@/sections/home/catalog-strip-section";
import { GiftingStepsSection } from "@/sections/home/gifting-steps-section";
import { ReviewsSection } from "@/sections/home/reviews-section";
import { BulkGiftingTeaserSection } from "@/sections/home/bulk-gifting-teaser-section";
import { getActiveCategories } from "@/lib/supabase/queries/categories";
import { getActiveProducts, getFeaturedProducts } from "@/lib/supabase/queries/products";
import { getFeaturedReviews } from "@/lib/supabase/queries/reviews";
import { getSiteSettings } from "@/lib/supabase/queries/settings";
import { buildWaLink } from "@/lib/whatsapp";

export default async function HomePage() {
  const [categories, products, featuredProducts, reviews, settings] = await Promise.all([
    getActiveCategories(),
    getActiveProducts(),
    getFeaturedProducts(),
    getFeaturedReviews(),
    getSiteSettings(),
  ]);

  const heroProducts = featuredProducts.length > 0 ? featuredProducts : products.slice(0, 5);

  const tiles: CategoryTile[] = categories.map((category) => ({
    slug: category.slug,
    name: category.name,
    count: products.filter((p) => p.categorySlug === category.slug).length,
  }));

  const waGiftLink =
    settings.whatsappEnabled && settings.whatsappNumber
      ? buildWaLink(settings.whatsappNumber, "Hi ZWIK! I need a gift suggestion. It is for:")
      : null;

  return (
    <>
      {/* The hero is above the fold on every viewport, so it is never
          reveal-wrapped — it must paint immediately. */}
      <HeroSection heroProducts={heroProducts} />

      {/*
        Reveals live inside each section, on the individual content blocks,
        rather than wrapping whole sections here.

        Wrapping a section was measured (scripts/check-animations.mjs) to make
        the effect invisible: a 510px block fired with 9% of it on screen, and
        full-height sections fired the moment their top edge grazed the viewport
        — so the fade was over before the reader arrived. Revealing the blocks
        themselves means each one animates as it comes into view.
      */}
      <CategoryTilesSection tiles={tiles} />
      <CatalogStripSection products={products} />
      <GiftingStepsSection waGiftLink={waGiftLink} />
      <ReviewsSection reviews={reviews} />
      <BulkGiftingTeaserSection />
    </>
  );
}
