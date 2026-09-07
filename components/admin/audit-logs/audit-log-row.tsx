import { Badge } from "@/components/ui/badge";
import type { AdminAuditLog, JsonValue } from "@/lib/supabase/queries/admin-audit-logs";

/**
 * One audit entry. Server Component on purpose — expansion uses a native
 * <details>, so the whole log viewer ships zero client JavaScript
 * (DEVELOPMENT_STANDARDS.md §17).
 */

/**
 * Fixed locale AND fixed time zone. Formatting with the runtime's ambient
 * locale/zone would render differently on the server than in the browser
 * (DATABASE_DESIGN.md §16). Explicit numeric parts rather than `dateStyle`
 * so the output does not shift with an ICU version bump either.
 */
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${TIMESTAMP_FORMAT.format(date)} IST`;
}

/**
 * Tone is a secondary cue only — every badge carries its written label, so the
 * state is never communicated by colour alone (DEVELOPMENT_STANDARDS.md §18).
 */
function actionVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  switch (action) {
    case "delete":
    case "login_failed":
      return "destructive";
    case "create":
    case "restore":
      return "default";
    case "archive":
    case "login":
      return "outline";
    default:
      return "secondary";
  }
}

/**
 * Renders a jsonb payload as indented JSON text.
 *
 * `JSON.stringify` into a text node — never dangerouslySetInnerHTML. Audit
 * payloads are attacker-influenced (an admin can type anything into a product
 * name), so they must stay inert text (DEVELOPMENT_STANDARDS.md §16).
 */
function JsonPanel({ title, value }: { title: string; value: JsonValue }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
        {title}
      </p>
      {/* Bounded box: a long slug or description must scroll inside this
          container rather than stretch the page. */}
      <div className="max-h-80 overflow-x-auto overflow-y-auto rounded-lg border border-border bg-muted/40">
        <pre className="p-3 font-mono text-xs leading-relaxed">
          {JSON.stringify(value, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export function AuditLogRow({ log }: { log: AdminAuditLog }) {
  const actorLabel = log.actorId
    ? // A name is only readable when the row belongs to the signed-in admin
      // (profiles RLS is select-own), so fall back to a neutral description
      // instead of implying the change was automated.
      (log.actorName ?? "Admin account")
    : "System";

  const panels: { title: string; value: JsonValue }[] = [];
  if (log.before !== null) panels.push({ title: "Before", value: log.before });
  if (log.after !== null) panels.push({ title: "After", value: log.after });
  if (log.metadata !== null) panels.push({ title: "Context", value: log.metadata });

  return (
    <li className="border-b border-border last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-3 pb-2">
        <time dateTime={log.createdAt} className="font-mono text-xs text-muted-foreground">
          {formatTimestamp(log.createdAt)}
        </time>

        <Badge variant={actionVariant(log.action)}>{log.actionLabel}</Badge>

        <span className="text-sm font-medium">{log.entityTypeLabel}</span>

        {log.entityId && (
          <code className="min-w-0 font-mono text-xs break-all text-muted-foreground">
            {log.entityId}
          </code>
        )}

        <span className="ms-auto text-xs text-muted-foreground">
          by <span className="font-medium text-foreground">{actorLabel}</span>
          {log.actorRole && (
            <span className="ms-1.5 font-mono tracking-wider uppercase opacity-70">
              {log.actorRole.replace("_", " ")}
            </span>
          )}
        </span>
      </div>

      {panels.length > 0 ? (
        <details className="px-4 pb-3">
          <summary className="w-fit cursor-pointer rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            Change details
          </summary>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {panels.map((panel) => (
              <JsonPanel key={panel.title} title={panel.title} value={panel.value} />
            ))}
          </div>
        </details>
      ) : (
        <p className="px-4 pb-3 text-xs text-muted-foreground">
          No field-level changes were recorded for this entry.
        </p>
      )}
    </li>
  );
}
