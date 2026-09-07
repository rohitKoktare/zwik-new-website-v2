import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";

/**
 * Admin view of site_settings. Unlike the storefront's getSiteSettings(), this
 * returns the row id (needed to update the singleton) and does not substitute
 * fallbacks — the admin must see exactly what is stored.
 */
export type AdminSiteSettings = {
  id: string | null;
  brandName: string;
  whatsappEnabled: boolean;
  whatsappNumber: string | null;
  whatsappDefaultMessage: string | null;
  instagramUrl: string | null;
  contactEmail: string | null;
  defaultSeoTitle: string | null;
  defaultSeoDescription: string | null;
  freeDeliveryThreshold: number | null;
  deliveryScopeNote: string | null;
  deliveryFee: number | null;
  /**
   * True when migration 0011 has not been applied, so the delivery columns do
   * not exist. The form surfaces this instead of silently discarding whatever
   * the admin types into the delivery fields.
   */
  deliveryMigrationPending: boolean;
  updatedAt: string | null;
};

const BASE_COLUMNS =
  "id, brand_name, whatsapp_enabled, whatsapp_number, whatsapp_default_message, instagram_url, contact_email, default_seo_title, default_seo_description, updated_at";

const DELIVERY_COLUMNS = "free_delivery_threshold, delivery_scope_note, delivery_fee";

/** Postgres `undefined_column` — migration 0011 has not been applied yet. */
const UNDEFINED_COLUMN = "42703";

const EMPTY: AdminSiteSettings = {
  id: null,
  brandName: "ZWIK",
  whatsappEnabled: false,
  whatsappNumber: null,
  whatsappDefaultMessage: null,
  instagramUrl: null,
  contactEmail: null,
  defaultSeoTitle: null,
  defaultSeoDescription: null,
  freeDeliveryThreshold: null,
  deliveryScopeNote: null,
  deliveryFee: null,
  deliveryMigrationPending: false,
  updatedAt: null,
};

type SettingsRow = {
  id: string;
  brand_name: string;
  whatsapp_enabled: boolean;
  whatsapp_number: string | null;
  whatsapp_default_message: string | null;
  instagram_url: string | null;
  contact_email: string | null;
  default_seo_title: string | null;
  default_seo_description: string | null;
  updated_at: string | null;
  free_delivery_threshold?: number | string | null;
  delivery_scope_note?: string | null;
  delivery_fee?: number | string | null;
};

/** `numeric` can arrive as a string depending on the driver. */
function toAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function toAdminSettings(row: SettingsRow, migrationPending: boolean): AdminSiteSettings {
  return {
    id: row.id,
    brandName: row.brand_name,
    whatsappEnabled: row.whatsapp_enabled,
    whatsappNumber: row.whatsapp_number,
    whatsappDefaultMessage: row.whatsapp_default_message,
    instagramUrl: row.instagram_url,
    contactEmail: row.contact_email,
    defaultSeoTitle: row.default_seo_title,
    defaultSeoDescription: row.default_seo_description,
    freeDeliveryThreshold: toAmount(row.free_delivery_threshold),
    deliveryScopeNote: row.delivery_scope_note ?? null,
    deliveryFee: toAmount(row.delivery_fee),
    deliveryMigrationPending: migrationPending,
    updatedAt: row.updated_at,
  };
}

/** See getSiteSettings for why a missing delivery column is degraded, not fatal. */
export async function getSettingsForAdmin(): Promise<AdminSiteSettings> {
  if (!isSupabaseConfigured) return EMPTY;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("site_settings")
    .select(`${BASE_COLUMNS}, ${DELIVERY_COLUMNS}`)
    .maybeSingle();

  if (!error) {
    return data ? toAdminSettings(data as SettingsRow, false) : EMPTY;
  }

  if (error.code !== UNDEFINED_COLUMN) {
    logger.error("getSettingsForAdmin failed", { error: error.message });
    return EMPTY;
  }

  logger.warn(
    "site_settings is missing the delivery columns — apply supabase/migrations/0011_delivery_settings.sql.",
  );

  const legacy = await supabase.from("site_settings").select(BASE_COLUMNS).maybeSingle();

  if (legacy.error) {
    logger.error("getSettingsForAdmin failed", { error: legacy.error.message });
    return EMPTY;
  }

  return legacy.data
    ? toAdminSettings(legacy.data as SettingsRow, true)
    : { ...EMPTY, deliveryMigrationPending: true };
}
