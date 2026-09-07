"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IDLE_RESULT } from "@/lib/admin/action-result";
import {
  markRecipientSentAction,
  skipRecipientAction,
} from "@/lib/admin/campaigns/actions";
import { buildCampaignMessage } from "@/lib/campaigns/message";
import { buildWaLink } from "@/lib/whatsapp";
import type { CampaignRecipient } from "@/types/campaign";

/**
 * One row of the send worklist.
 *
 * "Open & mark sent" opens WhatsApp *and* records the send, using the same
 * pattern as the storefront's order capture: the action is fired from the
 * anchor's onClick without `preventDefault` and is not awaited, so the new tab
 * stays attached to the user gesture and the popup blocker leaves it alone.
 *
 * Marking at open time is optimistic — the admin could still close WhatsApp
 * without pressing send. That is why "Undo" exists via Skip, and why the label
 * says what it does. The alternative (mark after sending) needs delivery
 * confirmation, which only the Cloud API can give.
 */
export function RecipientRow({
  recipient,
  campaignId,
  body,
}: {
  recipient: CampaignRecipient;
  campaignId: string;
  body: string;
}) {
  const [pending, startTransition] = useTransition();

  const link =
    recipient.contactable && recipient.customerPhone
      ? buildWaLink(recipient.customerPhone, buildCampaignMessage(body, recipient.customerName))
      : null;

  function run(action: typeof markRecipientSentAction) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", recipient.id);
      formData.set("campaignId", campaignId);

      const result = await action(IDLE_RESULT, formData);

      if (result.ok) toast.success(result.message ?? "Done.");
      else toast.error(result.formError ?? "That didn't work.");
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="font-medium">
          {recipient.customerName ?? (recipient.customerPhone ? "No name given" : "Record erased")}
        </div>
        {recipient.customerPhone && (
          <div className="font-mono text-xs text-muted-foreground">
            {recipient.customerPhone}
          </div>
        )}
        {!recipient.contactable && recipient.status === "pending" && (
          <div className="text-xs text-destructive">
            {recipient.customerPhone
              ? "Unsubscribed since this list was built — cannot be messaged."
              : "Personal data erased — cannot be messaged."}
          </div>
        )}
        {recipient.skipReason && (
          <div className="text-xs text-muted-foreground">Skipped: {recipient.skipReason}</div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {recipient.status === "sent" && <Badge variant="default">Sent</Badge>}
        {recipient.status === "skipped" && <Badge variant="secondary">Skipped</Badge>}

        {recipient.status === "pending" && (
          <>
            {link ? (
              <Button
                size="sm"
                disabled={pending}
                render={
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => run(markRecipientSentAction)}
                  />
                }
              >
                Open &amp; mark sent
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">No link available</span>
            )}

            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(skipRecipientAction)}
            >
              Skip
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
