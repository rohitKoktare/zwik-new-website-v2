import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";
import type { SiteSettings } from "@/types/settings";

type SiteSettingsRow = {
  whatsapp_number: string | null;
  whatsapp_default_message: string | null;
  whatsapp_enabled: boolean;
  amazon_store_url: string | null;
  instagram_url: string | null;
  contact_email: string | null;
  brand_name: string;
  default_seo_title: string | null;
  default_seo_description: string | null;
  /** Added by migration 0011; absent until it is applied. */
  free_delivery_threshold?: number | string | null;
  delivery_scope_note?: string | null;
  delivery_fee?: number | string | null;
};

/**
 * Columns that have existed since migration 0007. Selecting these can never
 * fail on a schema mismatch.
 */
const BASE_COLUMNS =
  "whatsapp_number, whatsapp_default_message, whatsapp_enabled, amazon_store_url, instagram_url, contact_email, brand_name, default_seo_title, default_seo_description";

/** Columns added by migration 0011. */
const DELIVERY_COLUMNS = "free_delivery_threshold, delivery_scope_note, delivery_fee";

/** Postgres `undefined_column` — migration 0011 has not been applied yet. */
const UNDEFINED_COLUMN = "42703";

const FALLBACK_SETTINGS: SiteSettings = {
  whatsappNumber: null,
  whatsappDefaultMessage: null,
  whatsappEnabled: false,
  amazonStoreUrl: null,
  instagramUrl: null,
  contactEmail: null,
  brandName: "ZWIK",
  defaultSeoTitle: null,
  defaultSeoDescription: null,
  freeDeliveryThreshold: null,
  deliveryScopeNote: null,
  deliveryFee: null,
};

/** `numeric` can arrive as a string depending on the driver. */
function toAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function toSettings(row: SiteSettingsRow): SiteSettings {
  return {
    whatsappNumber: row.whatsapp_number,
    whatsappDefaultMessage: row.whatsapp_default_message,
    whatsappEnabled: row.whatsapp_enabled,
    amazonStoreUrl: row.amazon_store_url,
    instagramUrl: row.instagram_url,
    contactEmail: row.contact_email,
    brandName: row.brand_name,
    defaultSeoTitle: row.default_seo_title,
    defaultSeoDescription: row.default_seo_description,
    freeDeliveryThreshold: toAmount(row.free_delivery_threshold),
    deliveryScopeNote: row.delivery_scope_note ?? null,
    deliveryFee: toAmount(row.delivery_fee),
  };
}

/**
 * Falls back to sensible, WhatsApp-disabled defaults when Supabase isn't
 * configured or no row exists yet.
 *
 * The delivery columns arrived in migration 0011. Rather than let one
 * unapplied migration take down the WhatsApp number — which would remove the
 * only way to order — a missing-column error retries without them and treats
 * the offer as "not running". The warning names the migration so this cannot
 * sit undiagnosed.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  if (!isSupabaseConfigured) {
    logger.debug("getSiteSettings skipped: Supabase not configured");
    return FALLBACK_SETTINGS;
  }

  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("site_settings")
    .select(`${BASE_COLUMNS}, ${DELIVERY_COLUMNS}`)
    .maybeSingle();

  if (!error) {
    return data ? toSettings(data as SiteSettingsRow) : FALLBACK_SETTINGS;
  }

  if (error.code !== UNDEFINED_COLUMN) {
    logger.error("getSiteSettings failed", { error: error.message });
    return FALLBACK_SETTINGS;
  }

  logger.warn(
    "site_settings is missing the delivery columns — apply supabase/migrations/0011_delivery_settings.sql. Free-delivery messaging is hidden until then.",
  );

  const legacy = await supabase.from("site_settings").select(BASE_COLUMNS).maybeSingle();

  if (legacy.error) {
    logger.error("getSiteSettings failed", { error: legacy.error.message });
    return FALLBACK_SETTINGS;
  }

  return legacy.data ? toSettings(legacy.data as SiteSettingsRow) : FALLBACK_SETTINGS;
}
