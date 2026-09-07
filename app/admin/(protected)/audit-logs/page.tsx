import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { AuditLogRow } from "@/components/admin/audit-logs/audit-log-row";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guard";
import { parsePagination, totalPages } from "@/lib/admin/pagination";
import {
  listAuditLogs,
  parseAuditAction,
  parseAuditEntityType,
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_TYPES,
  AUDIT_ENTITY_TYPE_LABELS,
} from "@/lib/supabase/queries/admin-audit-logs";

export const metadata: Metadata = { title: "Audit logs" };

const BASE_PATH = "/admin/audit-logs";

/**
 * Native <select> rather than components/ui/select: this filter is a plain GET
 * form, so the value has to reach the URL with no client JavaScript involved.
 * Styled to match the Input primitive.
 */
const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** `?a=1&a=2` arrives as an array; take the first value and validate it. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Read-only audit trail. Deliberately contains no mutations: `audit_logs` has
 * an admin SELECT policy and no insert policy at all, and entries are written
 * only by lib/audit through the service-role client (migration 0008).
 */
export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Page-level gate. The layout also guards, but reading this page depends on
  // a session, so the check belongs here too (DEVELOPMENT_STANDARDS.md §8).
  await requireAdmin();

  const params = await searchParams;

  // Every query parameter is validated server-side; anything unrecognised
  // (including the "all" sentinel) simply means "no filter".
  const action = parseAuditAction(firstValue(params.action));
  const entityType = parseAuditEntityType(firstValue(params.entityType));
  const rawPageSize = firstValue(params.pageSize);
  const pagination = parsePagination({
    page: firstValue(params.page),
    pageSize: rawPageSize,
  });

  const { logs, totalCount } = await listAuditLogs({ pagination, action, entityType });
  const pageCount = totalPages(totalCount, pagination.pageSize);
  const isFiltered = Boolean(action || entityType);

  // Echoed back into paging links so a filtered view survives Next/Previous.
  // Only normalised values are forwarded, never the raw query string.
  const activeParams = {
    action,
    entityType,
    pageSize: rawPageSize ? String(pagination.pageSize) : undefined,
  };

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Read-only history of admin changes to products, assets, homepage content and settings. Entries cannot be edited or removed from here."
      />

      <form
        method="get"
        action={BASE_PATH}
        className="mt-6 flex flex-wrap items-end gap-3 border border-border p-4"
      >
        <div className="grid gap-1.5">
          <label htmlFor="entityType" className="text-xs font-medium">
            Entity type
          </label>
          <select
            id="entityType"
            name="entityType"
            defaultValue={entityType ?? "all"}
            className={SELECT_CLASS}
          >
            <option value="all">All entity types</option>
            {AUDIT_ENTITY_TYPES.map((value) => (
              <option key={value} value={value}>
                {AUDIT_ENTITY_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="action" className="text-xs font-medium">
            Action
          </label>
          <select
            id="action"
            name="action"
            defaultValue={action ?? "all"}
            className={SELECT_CLASS}
          >
            <option value="all">All actions</option>
            {AUDIT_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {AUDIT_ACTION_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        {/* Keeps a non-default page size across a filter change. Submitting
            this form intentionally drops `page`, so filtering starts at 1. */}
        {rawPageSize && (
          <input type="hidden" name="pageSize" value={pagination.pageSize} />
        )}

        <Button type="submit" size="sm" variant="outline">
          Apply filters
        </Button>

        {isFiltered && (
          <Button variant="ghost" size="sm" render={<Link href={BASE_PATH} />}>
            Clear filters
          </Button>
        )}
      </form>

      {logs.length === 0 ? (
        <div className="mt-6">
          {isFiltered ? (
            <EmptyState
              title="No entries match these filters"
              description="Try a different entity type or action, or clear the filters to see the full history."
              action={
                <Button variant="outline" size="sm" render={<Link href={BASE_PATH} />}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No audit entries yet"
              description="Entries appear here automatically once admins create, update, archive or delete content, upload assets, or sign in."
            />
          )}
        </div>
      ) : (
        <>
          <ol aria-label="Audit entries, newest first" className="mt-6 border border-border">
            {logs.map((log) => (
              <AuditLogRow key={log.id} log={log} />
            ))}
          </ol>

          <div className="mt-4">
            <PaginationControls
              basePath={BASE_PATH}
              page={pagination.page}
              pageCount={pageCount}
              totalCount={totalCount}
              searchParams={activeParams}
            />
          </div>
        </>
      )}
    </>
  );
}
