"use client";

import { useActionState, useState } from "react";
import {
  createCampaignAction,
  updateCampaignAction,
} from "@/lib/admin/campaigns/actions";
import { IDLE_RESULT } from "@/lib/admin/action-result";
import { FormAlert } from "@/components/admin/form-alert";
import { FormField } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CAMPAIGN_BODY_MAX_LENGTH,
  MAX_ENCODED_MESSAGE_LENGTH,
  NAME_TOKEN,
  previewCampaignMessage,
  worstCaseEncodedLength,
} from "@/lib/campaigns/message";
import { CAMPAIGN_NAME_MAX_LENGTH } from "@/lib/validation/campaign";
import type { Campaign } from "@/types/campaign";

/**
 * Campaign composer.
 *
 * The preview runs the same `buildCampaignMessage` the send link uses, so what
 * the admin approves is exactly what goes out — including the opt-out line,
 * which is appended by that function and deliberately not an editable field.
 */
export function CampaignForm({
  campaign,
  audienceSize,
}: {
  campaign?: Campaign;
  /** How many customers have opted in right now. */
  audienceSize: number;
}) {
  const isEditing = Boolean(campaign);
  const [state, formAction] = useActionState(
    isEditing ? updateCampaignAction : createCampaignAction,
    IDLE_RESULT,
  );

  const [body, setBody] = useState(campaign?.body ?? "");

  /**
   * Two budgets, because characters are not what the link is limited by.
   * Percent-encoding expands non-Latin text roughly ninefold, so the encoded
   * figure is the one that actually decides whether the message fits.
   */
  const encoded = body.trim() ? worstCaseEncodedLength(body) : 0;
  const encodedPercent = Math.round((encoded / MAX_ENCODED_MESSAGE_LENGTH) * 100);
  const overBudget = encoded > MAX_ENCODED_MESSAGE_LENGTH;

  return (
    <form action={formAction} className="mt-6 grid max-w-2xl gap-6">
      {campaign && <input type="hidden" name="id" value={campaign.id} />}

      <FormAlert message={state.formError} />

      {state.ok && state.message && (
        <p role="status" className="border border-border bg-muted px-3 py-2 text-sm">
          {state.message}
        </p>
      )}

      <div className="border border-border bg-muted px-3 py-2.5 text-xs text-muted-foreground">
        <p className="text-sm font-medium text-foreground">
          Messages are sent by you, one at a time.
        </p>
        <p className="mt-1">
          The site cannot send WhatsApp messages — it can only open WhatsApp with the text
          ready. Once you start this campaign you get a list of everyone who has opted in,
          and you work through it. Nothing goes out on its own.
        </p>
        <p className="mt-1.5">
          {audienceSize === 0 ? (
            <strong className="text-foreground">
              Nobody has opted in to marketing yet, so this campaign will have no recipients.
            </strong>
          ) : (
            <>
              Right now{" "}
              <strong className="text-foreground">
                {audienceSize} {audienceSize === 1 ? "customer has" : "customers have"}
              </strong>{" "}
              opted in. Customers who never ticked the box, and anyone who unsubscribed, are
              excluded automatically.
            </>
          )}
        </p>
      </div>

      <FormField
        name="name"
        label="Campaign name"
        hint="Internal only — never sent to anyone. For example “Diwali gifting, Oct”."
        errors={state.fieldErrors?.name}
        required
      >
        <Input
          id="name"
          name="name"
          maxLength={CAMPAIGN_NAME_MAX_LENGTH}
          defaultValue={campaign?.name ?? ""}
          required
          aria-invalid={Boolean(state.fieldErrors?.name)}
        />
      </FormField>

      <FormField
        name="body"
        label="Message"
        hint={`Write ${NAME_TOKEN} to use the customer's name — it becomes “there” when we don't have one.`}
        errors={state.fieldErrors?.body}
        required
      >
        <Textarea
          id="body"
          name="body"
          rows={6}
          maxLength={CAMPAIGN_BODY_MAX_LENGTH}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={`Hi ${NAME_TOKEN}, we've just added a new set of miniature cottages…`}
          required
          aria-invalid={Boolean(state.fieldErrors?.body)}
        />
      </FormField>

      <div className="grid gap-1">
        <div
          className="h-1.5 w-full max-w-xs bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, encodedPercent)}
          aria-label="WhatsApp link budget used"
        >
          <div
            className="h-full transition-[width] duration-200"
            style={{
              width: `${Math.min(100, encodedPercent)}%`,
              background: overBudget ? "var(--destructive)" : "var(--primary)",
            }}
          />
        </div>
        <p className={`text-xs ${overBudget ? "text-destructive" : "text-muted-foreground"}`}>
          {overBudget ? (
            <>
              Too long for a WhatsApp link — {encodedPercent}% of the limit used. Non-Latin
              scripts take about nine times more room than English, so this fills up much
              faster in Hindi or Marathi.
            </>
          ) : (
            <>
              {encodedPercent}% of the WhatsApp link budget used ({body.length} of{" "}
              {CAMPAIGN_BODY_MAX_LENGTH} characters).
            </>
          )}
        </p>
      </div>

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Preview</h2>
        <p className="text-xs text-muted-foreground">
          Exactly what a customer named Asha would receive. The opt-out line is added
          automatically and cannot be removed — an opt-in you can&rsquo;t withdraw
          isn&rsquo;t consent, and WhatsApp requires it.
        </p>
        <pre className="overflow-x-auto border border-border bg-muted px-3 py-2.5 font-sans text-sm whitespace-pre-wrap">
          {body.trim() ? previewCampaignMessage(body) : "Write the message to see a preview."}
        </pre>
      </section>

      <div className="border-t border-border pt-6">
        <SubmitButton>{isEditing ? "Save campaign" : "Create campaign"}</SubmitButton>
      </div>
    </form>
  );
}
