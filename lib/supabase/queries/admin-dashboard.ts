import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";

/**
 * Read-only aggregates for the /admin landing page.
 *
 * Everything here is a count or a small bounded feed — no table is ever read
 * in full (DEVELOPMENT_STANDARDS.md §6, §17). All reads go through the
 * RLS-enforced server client, so an unauthorized session simply sees nothing
 * rather than being trusted by the page.
 */

/**
 * A metric is `null` when its query failed, so the dashboard can say
 * "unavailable" instead of rendering a misleading 0.
 */
export type DashboardCounts = {
  productsActive: number | null;
  productsTotal: number | null;
  assetsActive: number | null;
  reviewsActive: number | null;
  /** Featured AND active — a featured-but-hidden review appears nowhere public. */
  reviewsFeatured: number | null;
  heroSlidesActive: number | null;
};

const UNAVAILABLE_COUNTS: DashboardCounts = {
  productsActive: null,
  productsTotal: null,
  assetsActive: null,
  reviewsActive: null,
  reviewsFeatured: null,
  heroSlidesActive: null,
};

/**
 * Structural shape of a Supabase `head: true` count response. Declared locally
 * because generated database types do not exist in this project yet.
 */
type CountQueryResult = {
  count: number | null;
  error: { message: string } | null;
};

function readCount(metric: string, result: CountQueryResult): number | null {
  if (result.error) {
    // Technical detail stays in the log; the page renders a friendly
    // "unavailable" (DEVELOPMENT_STANDARDS.md §14).
    logger.error("getDashboardCounts metric failed", { metric, error: result.error.message });
    return null;
  }

  return result.count ?? 0;
}

/**
 * Headline counts for the dashboard cards. Every query is `head: true`, so
 * PostgREST returns the count only and never ships a single row over the wire.
 * They are independent, so they run concurrently.
 */
export async function getDashboardCounts(): Promise<DashboardCounts> {
  if (!isSupabaseConfigured) return UNAVAILABLE_COUNTS;

  const supabase = await createClient();

  const [
    productsActive,
    productsTotal,
    assetsActive,
    reviewsActive,
    reviewsFeatured,
    heroSlidesActive,
  ] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("assets").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("is_featured", true),
    supabase.from("hero_slides").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  return {
    productsActive: readCount("products.active", productsActive),
    productsTotal: readCount("products.total", productsTotal),
    assetsActive: readCount("assets.active", assetsActive),
    reviewsActive: readCount("reviews.active", reviewsActive),
    reviewsFeatured: readCount("reviews.featured", reviewsFeatured),
    heroSlidesActive: readCount("hero_slides.active", heroSlidesActive),
  };
}

export type ActivityEntry = {
  id: string;
  /** Raw `audit_logs.action`. The column is free text, so treat it as unknown. */
  action: string;
  /** Raw `audit_logs.entity_type`, likewise unconstrained at the database level. */
  entityType: string;
  /** Null when the row has no actor, or when RLS hides that actor's profile. */
  actorName: string | null;
  createdAt: string;
};

export type RecentActivity = {
  entries: ActivityEntry[];
  /**
   * False when the feed could not be read at all. Lets the UI distinguish
   * "nothing has happened yet" from "we could not find out".
   */
  available: boolean;
};

/** Deliberately small: the dashboard is a glance, /admin/audit-logs is the record. */
export const RECENT_ACTIVITY_LIMIT = 5;

/**
 * `profiles` has a select-own RLS policy only (migration 0001), so the embedded
 * actor resolves for the signed-in admin's own rows and comes back null for
 * everyone else's. The UI degrades to "Unknown admin" rather than inventing a
 * name; widening that would need a new profiles read policy, i.e. a migration.
 */
type ActorEmbed = { display_name: string | null } | { display_name: string | null }[] | null;

type AuditLogRow = {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  actor: ActorEmbed;
};

function readActorName(actor: ActorEmbed): string | null {
  if (!actor) return null;
  // PostgREST returns an object for a to-one embed, but tolerate an array too.
  const row = Array.isArray(actor) ? actor[0] : actor;
  return row?.display_name ?? null;
}

/**
 * The newest audit entries. Bounded by `limit` rather than parsePagination
 * because this is a fixed-size overview feed, not a browsable admin list —
 * the paginated view lives on /admin/audit-logs.
 */
export async function getRecentActivity(
  limit: number = RECENT_ACTIVITY_LIMIT,
): Promise<RecentActivity> {
  if (!isSupabaseConfigured) return { entries: [], available: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, created_at, actor:profiles(display_name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.error("getRecentActivity failed", { error: error.message });
    return { entries: [], available: false };
  }

  const entries = ((data ?? []) as AuditLogRow[]).map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    actorName: readActorName(row.actor),
    createdAt: row.created_at,
  }));

  return { entries, available: true };
}
