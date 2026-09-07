import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logger } from "@/lib/logger";
import type { Pagination } from "@/lib/admin/pagination";
import type { AuditAction, AuditEntityType } from "@/lib/audit";

/**
 * Admin audit-log reads. READ-ONLY by design.
 *
 * `audit_logs` has an admin-only SELECT policy and deliberately NO insert
 * policy (migration 0008) — writes go exclusively through the service-role
 * client in lib/audit. Nothing in this module may ever write.
 */

/** Anything `JSON.stringify` can round-trip, which is all jsonb ever holds. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Human labels for every audit action. Typed as a full `Record` so adding a
 * member to `AuditAction` in lib/audit fails to compile until it is labelled
 * here — the filter options below are derived from these keys, so the two can
 * never drift apart.
 */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: "Created",
  update: "Updated",
  archive: "Archived",
  restore: "Restored",
  delete: "Deleted",
  upload: "Uploaded",
  reorder: "Reordered",
  login: "Signed in",
  login_failed: "Sign-in failed",
};

export const AUDIT_ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  product: "Product",
  category: "Category",
  asset: "Asset",
  product_asset: "Product image",
  review: "Review",
  hero_slide: "Hero slide",
  site_settings: "Site settings",
  profile: "Admin profile",
  order: "Order",
  customer: "Customer record",
  campaign: "Campaign",
};

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];
export const AUDIT_ENTITY_TYPES = Object.keys(
  AUDIT_ENTITY_TYPE_LABELS,
) as AuditEntityType[];

/**
 * `action` / `entity_type` are plain `text` columns, so a stored value is not
 * guaranteed to be one we know about. Fall back to the raw value rather than
 * rendering a blank cell.
 */
export function auditActionLabel(action: string): string {
  const labels: Record<string, string> = AUDIT_ACTION_LABELS;
  return labels[action] ?? action;
}

export function auditEntityTypeLabel(entityType: string): string {
  const labels: Record<string, string> = AUDIT_ENTITY_TYPE_LABELS;
  return labels[entityType] ?? entityType;
}

/**
 * Server-side validation of the `?action=` / `?entityType=` query parameters
 * (DEVELOPMENT_STANDARDS.md §7). Anything unrecognised — including the "all"
 * sentinel the filter form posts — becomes `undefined`, i.e. no filter, so a
 * hand-edited URL can never reach the query builder.
 */
export function parseAuditAction(value: string | undefined): AuditAction | undefined {
  if (value === undefined) return undefined;
  return Object.hasOwn(AUDIT_ACTION_LABELS, value)
    ? (value as AuditAction)
    : undefined;
}

export function parseAuditEntityType(
  value: string | undefined,
): AuditEntityType | undefined {
  if (value === undefined) return undefined;
  return Object.hasOwn(AUDIT_ENTITY_TYPE_LABELS, value)
    ? (value as AuditEntityType)
    : undefined;
}

export type AdminAuditLog = {
  id: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityTypeLabel: string;
  entityId: string | null;
  actorId: string | null;
  /** Display name of the acting admin; null when it is not readable (see below). */
  actorName: string | null;
  actorRole: string | null;
  before: JsonValue | null;
  after: JsonValue | null;
  metadata: JsonValue | null;
  createdAt: string;
};

type ActorRow = { display_name: string | null; role: string | null };

/**
 * Shape returned by AUDIT_LOG_SELECT. Hand-written because generated Supabase
 * database types do not exist for this project yet — replace with the
 * generated `Database` types once a project is introspected.
 */
type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: JsonValue | null;
  after_data: JsonValue | null;
  metadata: JsonValue | null;
  created_at: string;
  /** PostgREST types a to-one embed as an object or an array depending on the
   * relationship it infers — normalise defensively, as products.ts does. */
  actor: ActorRow | ActorRow[] | null;
};

const AUDIT_LOG_SELECT = `
  id, actor_id, action, entity_type, entity_id,
  before_data, after_data, metadata, created_at,
  actor:profiles(display_name, role)
`;

function toAdminAuditLog(row: AuditLogRow): AdminAuditLog {
  const actor = Array.isArray(row.actor) ? (row.actor[0] ?? null) : row.actor;

  return {
    id: row.id,
    action: row.action,
    actionLabel: auditActionLabel(row.action),
    entityType: row.entity_type,
    entityTypeLabel: auditEntityTypeLabel(row.entity_type),
    entityId: row.entity_id,
    actorId: row.actor_id,
    // `profiles` only exposes "select your own row" under RLS, so the embed
    // resolves to null for other admins' entries. The row component renders
    // "System" for a null actor_id and a neutral fallback for this case, so a
    // missing name never reads as a system action.
    actorName: actor?.display_name ?? null,
    actorRole: actor?.role ?? null,
    before: row.before_data,
    after: row.after_data,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

/**
 * Newest-first page of audit entries. Always bounded by `.range()` — audit
 * tables grow without limit, so an unbounded read is never acceptable here
 * (DATABASE_DESIGN.md §19).
 */
export async function listAuditLogs(options: {
  pagination: Pagination;
  action?: AuditAction;
  entityType?: AuditEntityType;
}): Promise<{ logs: AdminAuditLog[]; totalCount: number }> {
  if (!isSupabaseConfigured) return { logs: [], totalCount: 0 };

  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select(AUDIT_LOG_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    // Stable tie-breaker: entries written in the same transaction share a
    // timestamp, and without this they could repeat or vanish across pages.
    .order("id", { ascending: false })
    .range(options.pagination.from, options.pagination.to);

  if (options.action) query = query.eq("action", options.action);
  if (options.entityType) query = query.eq("entity_type", options.entityType);

  const { data, error, count } = await query;

  if (error) {
    // Technical detail stays in the log; the page shows a friendly empty state
    // (DEVELOPMENT_STANDARDS.md §14).
    logger.error("listAuditLogs failed", { error: error.message });
    return { logs: [], totalCount: 0 };
  }

  return {
    logs: ((data ?? []) as unknown as AuditLogRow[]).map(toAdminAuditLog),
    totalCount: count ?? 0,
  };
}
