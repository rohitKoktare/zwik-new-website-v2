import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { CampaignForm } from "@/components/admin/campaigns/campaign-form";
import { RecipientRow } from "@/components/admin/campaigns/recipient-row";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guard";
import { parsePagination, totalPages } from "@/lib/admin/pagination";
import {
  getCampaignById,
  listCampaignRecipients,
} from "@/lib/supabase/queries/admin-campaigns";
import { countContactableCustomers } from "@/lib/supabase/queries/admin-customers";
import {
  cancelCampaignAction,
  startCampaignAction,
} from "@/lib/admin/campaigns/actions";
import { previewCampaignMessage } from "@/lib/campaigns/message";
import { uuidSchema } from "@/lib/validation/common";
import { CAMPAIGN_STATUS_HINTS, CAMPAIGN_STATUS_LABELS } from "@/types/campaign";

export const metadata: Metadata = { title: "Campaign" };

const CAMPAIGNS_PATH = "/admin/campaigns";

export default async function AdminCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  await requireAdmin();

  const [{ id }, query] = await Promise.all([params, searchParams]);

  // Route params are untrusted input (DEVELOPMENT_STANDARDS.md §7).
  if (!uuidSchema.safeParse(id).success) notFound();

  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  const pagination = parsePagination(query);

  const [{ recipients, totalCount }, audience] = await Promise.all([
    campaign.status === "draft"
      ? Promise.resolve({ recipients: [], totalCount: 0 })
      : listCampaignRecipients({ campaignId: id, pagination }),
    countContactableCustomers(),
  ]);

  const pageCount = totalPages(totalCount, pagination.pageSize);
  const isDraft = campaign.status === "draft";

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={CAMPAIGN_STATUS_HINTS[campaign.status]}
        action={
          // Base UI composes via `render`, not Radix's `asChild`.
          <Button variant="outline" render={<Link href={CAMPAIGNS_PATH} />}>
            Back to campaigns
          </Button>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant={campaign.status === "completed" ? "default" : "outline"}>
          {CAMPAIGN_STATUS_LABELS[campaign.status]}
        </Badge>
        {campaign.counts.total > 0 && (
          <Badge variant="secondary">
            {campaign.counts.sent} sent · {campaign.counts.skipped} skipped ·{" "}
            {campaign.counts.pending} left
          </Badge>
        )}
      </div>

      {isDraft ? (
        <>
          <CampaignForm campaign={campaign} audienceSize={audience.contactable} />

          <section className="mt-8 grid max-w-2xl gap-3 border-t border-border pt-6">
            <h2 className="text-sm font-semibold tracking-tight">Start sending</h2>
            <p className="text-xs text-muted-foreground">
              This locks in the audience: every customer who has opted in and not
              unsubscribed, {audience.contactable} right now. The message can&rsquo;t be
              edited afterwards — otherwise two different messages would go out under one
              campaign and you could never tell who got which.
            </p>
            <div>
              <ConfirmAction
                action={startCampaignAction}
                hiddenFields={{ id: campaign.id }}
                trigger={
                  <Button disabled={audience.contactable === 0}>
                    Lock in {audience.contactable}{" "}
                    {audience.contactable === 1 ? "recipient" : "recipients"}
                  </Button>
                }
                title="Lock in the audience?"
                description={`${audience.contactable} opted-in ${audience.contactable === 1 ? "customer" : "customers"} will be added to the send list, and the message becomes read-only. Nothing is sent yet — you send each message yourself from the list.`}
                confirmLabel="Lock in and continue"
              />
            </div>
            {audience.contactable === 0 && (
              <p role="alert" className="text-xs text-destructive">
                Nobody has opted in yet, so there is nothing to start. Customers opt in with
                the checkbox in the cart.
              </p>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="mt-6 grid gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Message</h2>
            <pre className="max-w-2xl overflow-x-auto border border-border bg-muted px-3 py-2.5 font-sans text-sm whitespace-pre-wrap">
              {previewCampaignMessage(campaign.body)}
            </pre>
            <p className="text-xs text-muted-foreground">
              Shown with a sample name. Each recipient gets their own name filled in.
            </p>
          </section>

          <section className="mt-8 grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-sm font-semibold tracking-tight">
                Send list ({totalCount})
              </h2>
              {campaign.status === "sending" && campaign.counts.pending > 0 && (
                <ConfirmAction
                  action={cancelCampaignAction}
                  hiddenFields={{ id: campaign.id }}
                  trigger={
                    <Button variant="outline" size="sm">
                      Cancel campaign
                    </Button>
                  }
                  title="Cancel this campaign?"
                  description={`${campaign.counts.pending} ${campaign.counts.pending === 1 ? "person has" : "people have"} not been messaged yet and won't be. Anything already sent stays sent.`}
                  confirmLabel="Cancel campaign"
                />
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              &ldquo;Open &amp; mark sent&rdquo; opens WhatsApp with the message ready and
              records it as sent. You still press send in WhatsApp — the site cannot tell
              whether you did, so if you close it without sending, use Skip to correct the
              record.
            </p>

            {recipients.length === 0 ? (
              <p className="border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                No recipients on this page.
              </p>
            ) : (
              <div className="border border-border">
                {recipients.map((recipient) => (
                  <RecipientRow
                    key={recipient.id}
                    recipient={recipient}
                    campaignId={campaign.id}
                    body={campaign.body}
                  />
                ))}
              </div>
            )}

            <PaginationControls
              basePath={`${CAMPAIGNS_PATH}/${campaign.id}`}
              page={pagination.page}
              pageCount={pageCount}
              totalCount={totalCount}
              searchParams={{ pageSize: query.pageSize }}
            />
          </section>
        </>
      )}
    </>
  );
}
