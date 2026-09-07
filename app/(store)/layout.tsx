import { CartProvider } from "@/components/store/cart-provider";
import { SiteHeader } from "@/components/store/site-header";
import { SiteFooter } from "@/components/store/site-footer";
import { AnnouncementTicker } from "@/components/store/announcement-ticker";
import { CartDrawer } from "@/components/store/cart-drawer";
import { CustomCursor } from "@/components/store/custom-cursor";
import { getSiteSettings } from "@/lib/supabase/queries/settings";
import { getActiveCategories } from "@/lib/supabase/queries/categories";
import { getDeliveryTerms } from "@/lib/store/delivery";
import { buildWaLink } from "@/lib/whatsapp";

/**
 * Storefront content is public and identical for every visitor, so it is
 * pre-rendered and cached rather than rebuilt per request
 * (ARCHITECTURE.md §15).
 *
 * Admin writes call revalidatePath() (see lib/admin/revalidate.ts), so edits
 * appear immediately. This hourly window is only the backstop for anything
 * changed directly in the database, bypassing the admin UI.
 */
export const revalidate = 3600;

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [settings, categories] = await Promise.all([
    getSiteSettings(),
    // The footer's "Shop by spot" column is category-driven, so this is needed
    // on every page rather than only on the catalog.
    getActiveCategories(),
  ]);

  const waLink =
    settings.whatsappEnabled && settings.whatsappNumber
      ? buildWaLink(
          settings.whatsappNumber,
          settings.whatsappDefaultMessage ?? "Hi ZWIK! I saw your site and wanted to ask about a piece.",
        )
      : null;

  const delivery = getDeliveryTerms(settings);

  // Rendered on the server so the footer's copyright year does not depend on
  // the visitor's clock and cannot mismatch between server and client HTML.
  const year = new Date().getFullYear();

  return (
    <CartProvider>
      <SiteHeader waLink={waLink ?? "/contact"} />
      <AnnouncementTicker deliveryHeadline={delivery.headline} />
      <main className="flex-1">{children}</main>
      <SiteFooter
        waLink={waLink}
        phoneLabel={settings.whatsappNumber}
        categories={categories}
        delivery={delivery}
        year={year}
      />
      <CartDrawer
        whatsappNumber={settings.whatsappEnabled ? settings.whatsappNumber : null}
        delivery={delivery}
      />
      <CustomCursor />
    </CartProvider>
  );
}
