import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * Audit log writer.
 *
 * Uses the service-role client deliberately: `audit_logs` has an admin-only
 * SELECT policy and NO insert policy at all (see migration 0008), so the table
 * is append-only from trusted server code and cannot be forged from a browser
 * session — even by a signed-in admin.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY. Admin mutations should still succeed if
 * audit writing fails (a broken log must not block a legitimate content fix),
 * but the failure is logged at error level so it is never silent.
 */

export type AuditAction =
  | "create"
  | "update"
  | "archive"
  | "restore"
  | "delete"
  | "upload"
  | "reorder"
  | "login"
  | "login_failed";

export type AuditEntityType =
  | "product"
  | "category"
  | "asset"
  | "product_asset"
  | "review"
  | "hero_slide"
  | "site_settings"
  | "profile"
  | "order"
  | "customer"
  | "campaign";

type JsonRecord = Record<string, unknown>;

/**
 * Keys that must never land in an audit payload. Audit rows are long-lived and
 * readable by every admin, so they are the wrong place for credentials or
 * customer contact details.
 */
const SENSITIVE_KEY_PATTERN =
  /(password|token|secret|api[-_]?key|service[-_]?role|session|authorization|cookie|access[-_]?key|phone|email)/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord).map(([key, val]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : scrub(val, depth + 1),
      ]),
    );
  }

  return value;
}

/**
 * Returns only the fields that actually changed, so an audit row shows the
 * diff rather than a full duplicate of the record on every edit.
 */
export function diffRecords(
  before: JsonRecord | null,
  after: JsonRecord | null,
): { before: JsonRecord | null; after: JsonRecord | null } {
  if (!before || !after) return { before, after };

  const changedKeys = new Set(
    [...Object.keys(before), ...Object.keys(after)].filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    ),
  );

  if (changedKeys.size === 0) return { before: null, after: null };

  const pick = (source: JsonRecord) =>
    Object.fromEntries([...changedKeys].map((key) => [key, source[key]]));

  return { before: pick(before), after: pick(after) };
}

export type AuditEvent = {
  actorId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  before?: JsonRecord | null;
  after?: JsonRecord | null;
  metadata?: JsonRecord | null;
};

export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const supabase = createAdminClient();

    const { error } = await supabase.from("audit_logs").insert({
      actor_id: event.actorId,
      action: event.action,
      entity_type: event.entityType,
      entity_id: event.entityId ?? null,
      before_data: event.before ? scrub(event.before) : null,
      after_data: event.after ? scrub(event.after) : null,
      metadata: event.metadata ? scrub(event.metadata) : null,
    });

    if (error) throw new Error(error.message);
  } catch (cause) {
    // Never rethrow: a failed audit write must not roll back a completed
    // content change. Surfaced loudly instead so it can't rot unnoticed.
    logger.error("Audit log write failed", {
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      reason: cause instanceof Error ? cause.message : "unknown",
    });
  }
}
