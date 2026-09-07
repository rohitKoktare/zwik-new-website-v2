import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guard";
import { parsePagination, totalPages } from "@/lib/admin/pagination";
import { listCampaignsForAdmin } from "@/lib/supabase/queries/admin-campaigns";
import { countContactableCustomers } from "@/lib/supabase/queries/admin-customers";
import { CAMPAIGN_STATUS_LABELS } from "@/types/campaign";

export const metadata: Metadata = { title: "Campaigns" };

const CAMPAIGNS_PATH = "/admin/campaigns";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const pagination = parsePagination(params);

  const [{ campaigns, totalCount }, audience] = await Promise.all([
    listCampaignsForAdmin({ pagination }),
    countContactableCustomers(),
  ]);

  const pageCount = totalPages(totalCount, pagination.pageSize);

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="WhatsApp messages to customers who opted in. You send each one yourself — the site can only open WhatsApp with the text ready, it cannot deliver messages."
        action={
          // Base UI composes via `render`, not Radix's `asChild`.
          <Button render={<Link href={`${CAMPAIGNS_PATH}/new`} />}>New campaign</Button>
        }
      />

      <p className="mt-4 border border-border bg-muted px-3 py-2 text-sm">
        <strong>{audience.contactable}</strong> of {audience.total} customer records have
        opted in to marketing. Everyone else is excluded from every campaign automatically.
      </p>

      {campaigns.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No campaigns yet"
            description="Write one, then work through the list of opted-in customers."
            action={
              <Button render={<Link href={`${CAMPAIGNS_PATH}/new`} />}>New campaign</Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-6 border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(campaign.createdAt)}
                    </TableCell>
                    <TableCell>
                      {campaign.counts.total === 0 ? (
                        <span className="text-muted-foreground">not started</span>
                      ) : (
                        <span>
                          {campaign.counts.sent} sent
                          {campaign.counts.skipped > 0 && (
                            <span className="text-muted-foreground">
                              {" "}
                              · {campaign.counts.skipped} skipped
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            {" "}
                            of {campaign.counts.total}
                          </span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={campaign.status === "completed" ? "default" : "outline"}>
                        {CAMPAIGN_STATUS_LABELS[campaign.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={`${CAMPAIGNS_PATH}/${campaign.id}`} />}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4">
            <PaginationControls
              basePath={CAMPAIGNS_PATH}
              page={pagination.page}
              pageCount={pageCount}
              totalCount={totalCount}
              searchParams={{ pageSize: params.pageSize }}
            />
          </div>
        </>
      )}
    </>
  );
}
