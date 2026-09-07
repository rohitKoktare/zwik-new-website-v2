import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getDashboardCounts,
  getRecentActivity,
  type ActivityEntry,
  type DashboardCounts,
  type RecentActivity,
} from "@/lib/supabase/queries/admin-dashboard";
import { getSettingsForAdmin } from "@/lib/supabase/queries/admin-settings";
import { isSupabaseConfigured } from "@/lib/validation/env";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Fixed locale + time zone so the string the server renders is identical to
 * anything the client would produce. A machine-local format would differ per
 * viewer and mismatch on hydration.
 */
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return `${TIMESTAMP_FORMAT.format(date)} IST`;
}

/**
 * `audit_logs.action` and `.entity_type` are plain text columns, so an unknown
 * value is possible. Known values get a proper label; anything else is
 * humanized rather than hidden, so the feed never silently drops an event.
 */
const ACTION_LABELS: Record<string, string> = {
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

const ENTITY_LABELS: Record<string, string> = {
  product: "Product",
  category: "Category",
  asset: "Asset",
  product_asset: "Product image",
  review: "Review",
  hero_slide: "Hero slide",
  site_settings: "Site settings",
  profile: "Admin profile",
};

/** Sign-in events carry a profile entity that adds nothing to the sentence. */
const ACTIONS_WITHOUT_ENTITY = new Set(["login", "login_failed"]);

function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ").trim();
  if (!spaced) return "Unknown";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Admin landing page. Read-only overview: no mutations live here.
 *
 * Rendering is gated by app/admin/(protected)/layout.tsx (requireAdmin), and
 * every read below goes through the RLS-enforced client, so this page adds no
 * second guard of its own — it needs no role beyond "may reach /admin".
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  // Next.js 16: searchParams is a Promise and must be awaited.
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;
  const permissionDenied = denied === "1";

  const header = (
    <PageHeader
      title="Dashboard"
      description="Whether customers can order right now, what is live on the site, and who changed what."
    />
  );

  // Without Supabase every query below returns empty. Say so plainly instead
  // of rendering a wall of zeros that reads like an empty catalogue.
  if (!isSupabaseConfigured) {
    return (
      <>
        {header}
        {permissionDenied && <PermissionNotice />}
        <SetupNotice />
      </>
    );
  }

  // Independent reads, so run them concurrently.
  const [settings, counts, activity] = await Promise.all([
    getSettingsForAdmin(),
    getDashboardCounts(),
    getRecentActivity(),
  ]);

  return (
    <>
      {header}
      {permissionDenied && <PermissionNotice />}
      <OrderingStatus
        whatsappEnabled={settings.whatsappEnabled}
        whatsappNumber={settings.whatsappNumber}
      />
      <CountsOverview counts={counts} />
      <RecentActivityFeed activity={activity} />
    </>
  );
}

/**
 * requireRole() sends a user here with ?denied=1 when they lack rights for a
 * section. Polite rather than assertive, so it does not fight the ordering
 * banner for a screen reader's attention.
 */
function PermissionNotice() {
  return (
    <div
      role="status"
      className="mt-6 flex items-start gap-2 border border-border bg-muted px-3 py-2 text-sm"
    >
      <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        You don&apos;t have permission to open that section. Ask a super admin if you need
        access.
      </p>
    </div>
  );
}

function SetupNotice() {
  return (
    <section aria-labelledby="setup-heading" className="mt-6 border border-border p-6">
      <h2 id="setup-heading" className="text-sm font-semibold tracking-tight">
        Setup required &mdash; Supabase is not connected
      </h2>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Nothing has been read from the database, so no counts or activity are shown here. They
        would all read zero, and zero would be misleading.
      </p>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Copy <code className="font-mono text-xs">.env.example</code> to{" "}
        <code className="font-mono text-xs">.env.local</code>, fill in{" "}
        <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
        <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and{" "}
        <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code>, then restart the
        server.
      </p>
    </section>
  );
}

/**
 * The most important thing on this page. WhatsApp is the only ordering channel
 * (ARCHITECTURE.md §1), so a disabled toggle or a blank number means the site
 * cannot take a single order. The state is carried by the wording, not by the
 * colour (DEVELOPMENT_STANDARDS.md §18).
 */
function OrderingStatus({
  whatsappEnabled,
  whatsappNumber,
}: {
  whatsappEnabled: boolean;
  whatsappNumber: string | null;
}) {
  const number = whatsappNumber?.trim() ?? "";

  const blockers: string[] = [];
  if (!whatsappEnabled) blockers.push("WhatsApp ordering is switched off in Settings.");
  if (!number) blockers.push("No WhatsApp number is saved.");

  if (blockers.length > 0) {
    return (
      <section
        role="alert"
        aria-labelledby="ordering-status-heading"
        className="mt-6 border-2 border-destructive/50 bg-destructive/5 p-4"
      >
        <div className="flex items-start gap-3">
          <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0">
            <h2
              id="ordering-status-heading"
              className="text-sm font-semibold tracking-tight text-destructive"
            >
              Ordering is offline &mdash; customers cannot place an order
            </h2>
            <p className="mt-1 max-w-prose text-sm">
              WhatsApp is the only way to buy from ZWIK. Until this is fixed, the storefront has
              no working way to send an order.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
            <div className="mt-3">
              {/* Base UI composes via `render`, never Radix-style `asChild`. */}
              <Button size="sm" render={<Link href="/admin/settings" />}>
                Fix in Settings
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="ordering-status-heading"
      className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border border-border bg-muted/40 px-4 py-3"
    >
      <CircleCheckIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <h2 id="ordering-status-heading" className="text-sm font-medium">
        Ordering is live
      </h2>
      <p className="text-sm text-muted-foreground">
        Orders arrive on WhatsApp at <span className="font-mono">{number}</span>.
      </p>
      <Link
        href="/admin/settings"
        className="text-sm underline underline-offset-4 hover:no-underline"
      >
        Change
      </Link>
    </section>
  );
}

type StatCard = {
  href: string;
  label: string;
  /** null means the count could not be read — never render it as 0. */
  value: number | null;
  detail: string;
};

function CountsOverview({ counts }: { counts: DashboardCounts }) {
  const cards: StatCard[] = [
    {
      href: "/admin/products",
      label: "Products",
      value: counts.productsActive,
      detail:
        counts.productsTotal === null
          ? "Live on the storefront"
          : `Live on the storefront, ${counts.productsTotal} in total`,
    },
    {
      href: "/admin/assets",
      label: "Assets",
      value: counts.assetsActive,
      detail: "Active in the media library",
    },
    {
      href: "/admin/reviews",
      label: "Reviews",
      value: counts.reviewsActive,
      detail:
        counts.reviewsFeatured === null
          ? "Shown on the site"
          : `Shown on the site, ${counts.reviewsFeatured} featured`,
    },
    {
      href: "/admin/homepage",
      label: "Hero slides",
      value: counts.heroSlidesActive,
      detail: "Active on the homepage",
    },
  ];

  return (
    <section aria-labelledby="overview-heading" className="mt-8">
      <h2 id="overview-heading" className="text-sm font-semibold tracking-tight">
        What is live
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="flex h-full flex-col gap-1 border border-border p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {card.label}
              </span>
              <span className="text-2xl font-semibold tabular-nums">
                {card.value === null ? "—" : card.value}
              </span>
              <span className="text-xs text-muted-foreground">
                {card.value === null ? "Count unavailable, try refreshing" : card.detail}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const actionLabel = ACTION_LABELS[entry.action] ?? humanize(entry.action);
  const entityLabel = ACTIONS_WITHOUT_ENTITY.has(entry.action)
    ? null
    : (ENTITY_LABELS[entry.entityType] ?? humanize(entry.entityType));

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">{entry.actorName ?? "Unknown admin"}</span>
        <Badge variant="outline">{actionLabel}</Badge>
        {entityLabel && <span className="text-muted-foreground">{entityLabel}</span>}
      </span>
      <time dateTime={entry.createdAt} className="font-mono text-xs text-muted-foreground">
        {formatTimestamp(entry.createdAt)}
      </time>
    </li>
  );
}

function RecentActivityFeed({ activity }: { activity: RecentActivity }) {
  return (
    <section aria-labelledby="activity-heading" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="activity-heading" className="text-sm font-semibold tracking-tight">
          Recent activity
        </h2>
        <Link
          href="/admin/audit-logs"
          className="text-sm underline underline-offset-4 hover:no-underline"
        >
          View all audit logs
        </Link>
      </div>

      {!activity.available ? (
        <p role="status" className="mt-3 border border-border px-4 py-3 text-sm">
          Recent activity couldn&apos;t be loaded just now. Refresh to try again, or open the
          audit logs.
        </p>
      ) : activity.entries.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="No admin activity recorded yet"
            description="Changes to products, assets, reviews and settings appear here as they happen."
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border border border-border">
          {activity.entries.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}
