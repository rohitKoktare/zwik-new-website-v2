import { logger } from "@/lib/logger";

/**
 * Recognises a query that failed only because a migration has not been applied.
 *
 * Without this, every admin page load logs a full error stack for a condition
 * that is expected and already documented — which trains everyone to ignore the
 * error channel, so the one real failure gets ignored too.
 *
 * PostgREST codes:
 *   PGRST205 — relation not found in the schema cache (table missing)
 *   42P01    — undefined_table, straight from Postgres
 *   42703    — undefined_column
 */
const MISSING_SCHEMA_CODES = new Set(["PGRST205", "42P01", "42703"]);

/** Which migration introduces each table, for the message. */
const TABLE_MIGRATIONS: Record<string, string> = {
  customers: "0012_customers_and_orders.sql",
  orders: "0012_customers_and_orders.sql",
  order_items: "0012_customers_and_orders.sql",
  message_campaigns: "0013_message_campaigns.sql",
  campaign_recipients: "0013_message_campaigns.sql",
};

export type QueryError = { code?: string | null; message?: string | null } | null;

/** True when the error means "this migration has not been applied yet". */
export function isPendingMigration(error: QueryError): boolean {
  if (!error) return false;
  if (error.code && MISSING_SCHEMA_CODES.has(error.code)) return true;
  // Some PostgREST versions omit the code on a schema-cache miss.
  return /could not find the table|schema cache/i.test(error.message ?? "");
}

/**
 * Logs a query failure at the right level.
 *
 * A pending migration is a warning with a one-line instruction. Anything else
 * is a genuine error and keeps its detail.
 *
 * Returns true when it was a pending migration, so callers can skip their own
 * error logging.
 */
export function logQueryFailure(
  operation: string,
  error: QueryError,
  table?: string,
): boolean {
  if (isPendingMigration(error)) {
    const migration = table ? TABLE_MIGRATIONS[table] : undefined;

    logger.warn(
      migration
        ? `${operation}: ${migration} has not been applied — run \`npm run db:push\`. This screen is empty until then.`
        : `${operation}: a table or column is missing — a migration has not been applied. Run \`npm run db:push\`.`,
    );
    return true;
  }

  logger.error(`${operation} failed`, { error: error?.message ?? "unknown" });
  return false;
}
