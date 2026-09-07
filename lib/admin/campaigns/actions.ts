"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedActor } from "@/lib/auth/guard";
import { getCampaignById } from "@/lib/supabase/queries/admin-campaigns";
import {
  campaignIdSchema,
  campaignInputSchema,
  campaignUpdateSchema,
  recipientActionSchema,
} from "@/lib/validation/campaign";
import { diffRecords, recordAuditEvent } from "@/lib/audit";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { logger } from "@/lib/logger";
import {
  actionError,
  actionSuccess,
  parseForm,
  type ActionResult,
} from "@/lib/admin/action-result";

/**
 * Campaign mutations.
 *
 * Nothing here sends a message. ZWIK has no WhatsApp Business Platform
 * credentials, and a wa.me link cannot deliver anything — it opens WhatsApp with
 * text prefilled and a human presses send. So `markRecipientSentAction` records
 * what a person did; it is not a send, and it is the only way a row becomes
 * 'sent'. That distinction is the whole reason the status is human-set.
 *
 * The consent gate lives in `startCampaignAction` (which builds the audience)
 * and again in `markRecipientSentAction` (which refuses a recipient who is no
 * longer contactable). Two checks, because the audience is snapshotted but
 * consent keeps moving.
 */

const CAMPAIGNS_PATH = "/admin/campaigns";
const PERMISSION_ERROR = "You don't have permission to manage campaigns.";
const MISSING_ERROR = "That campaign no longer exists.";

export async function createCampaignAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(campaignInputSchema, formData);
  if (!parsed.success) return parsed.result;
  const input = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_campaigns")
    .insert({ name: input.name, body: input.body, created_by: actor.id })
    .select("id")
    .single();

  if (error || !data) {
    logger.error("createCampaignAction failed", {
      actorId: actor.id,
      error: error?.message,
    });
    return actionError("Couldn't create that campaign. Please try again.");
  }

  const id = (data as { id: string }).id;

  await recordAuditEvent({
    actorId: actor.id,
    action: "create",
    entityType: "campaign",
    entityId: id,
    before: null,
    after: { name: input.name, bodyLength: input.body.length },
  });

  revalidateAdmin(CAMPAIGNS_PATH);

  // redirect() throws, so it is last and never inside a try block.
  redirect(`${CAMPAIGNS_PATH}/${id}`);
}

export async function updateCampaignAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(campaignUpdateSchema, formData);
  if (!parsed.success) return parsed.result;
  const input = parsed.data;

  const before = await getCampaignById(input.id);
  if (!before) return actionError(MISSING_ERROR);

  /**
   * The message is frozen once the audience is locked in. Editing it midway
   * would mean two different messages went out under one campaign, and the
   * already-sent recipients could never be told which they got.
   */
  if (before.status !== "draft") {
    return actionError(
      "This campaign has already started, so the message can't be changed. Create a new campaign instead.",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("message_campaigns")
    .update({ name: input.name, body: input.body, updated_at: new Date().toISOString() })
    .eq("id", input.id);

  if (error) {
    logger.error("updateCampaignAction failed", {
      actorId: actor.id,
      campaignId: input.id,
      error: error.message,
    });
    return actionError("Couldn't save that campaign. Please try again.");
  }

  const { before: beforeDiff, after: afterDiff } = diffRecords(
    { name: before.name, bodyLength: before.body.length },
    { name: input.name, bodyLength: input.body.length },
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: "update",
    entityType: "campaign",
    entityId: input.id,
    before: beforeDiff,
    after: afterDiff,
  });

  revalidateAdmin(CAMPAIGNS_PATH);
  revalidateAdmin(`${CAMPAIGNS_PATH}/${input.id}`);

  return actionSuccess("Campaign saved.");
}

/**
 * Locks in the audience: every customer who has opted in and not unsubscribed.
 *
 * This is the consent gate. The audience is built by querying consent directly
 * rather than from anything the admin selected, so there is no UI path that can
 * add a non-consenting customer to a campaign. Customers with no consent are
 * not inserted as 'skipped' — they are simply never in the list, so the
 * recipient table cannot become a record of people ZWIK considered messaging
 * without permission.
 */
export async function startCampaignAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(campaignIdSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id } = parsed.data;

  const campaign = await getCampaignById(id);
  if (!campaign) return actionError(MISSING_ERROR);
  if (campaign.status !== "draft") {
    return actionError("This campaign has already started.");
  }

  const supabase = await createClient();

  // The audience. Bounded: a send this large is not a click-through worklist,
  // and silently truncating would be worse than refusing.
  const { data: audience, error: audienceError } = await supabase
    .from("customers")
    .select("id")
    .eq("marketing_consent", true)
    .is("unsubscribed_at", null)
    .limit(2000);

  if (audienceError) {
    logger.error("startCampaignAction audience read failed", {
      actorId: actor.id,
      error: audienceError.message,
    });
    return actionError("Couldn't build the audience. Please try again.");
  }

  const rows = (audience ?? []) as { id: string }[];

  if (rows.length === 0) {
    return actionError(
      "Nobody has opted in to marketing yet, so there is no one to send to. Customers opt in with the checkbox in the cart.",
    );
  }

  const { error: insertError } = await supabase.from("campaign_recipients").insert(
    rows.map((row) => ({ campaign_id: id, customer_id: row.id })),
  );

  if (insertError) {
    logger.error("startCampaignAction recipient insert failed", {
      actorId: actor.id,
      campaignId: id,
      error: insertError.message,
    });
    return actionError("Couldn't build the recipient list. Please try again.");
  }

  const now = new Date().toISOString();
  const { error: statusError } = await supabase
    .from("message_campaigns")
    .update({ status: "sending", started_at: now, updated_at: now })
    .eq("id", id);

  if (statusError) {
    logger.error("startCampaignAction status update failed", {
      actorId: actor.id,
      campaignId: id,
      error: statusError.message,
    });
    return actionError("Recipients were added but the campaign status didn't update.");
  }

  await recordAuditEvent({
    actorId: actor.id,
    action: "update",
    entityType: "campaign",
    entityId: id,
    before: { status: "draft" },
    after: { status: "sending" },
    metadata: { audienceSize: rows.length, gatedOn: "marketing_consent" },
  });

  revalidateAdmin(CAMPAIGNS_PATH);
  revalidateAdmin(`${CAMPAIGNS_PATH}/${id}`);

  return actionSuccess(
    `${rows.length} ${rows.length === 1 ? "recipient" : "recipients"} added — everyone who has opted in. Work through the list to send.`,
  );
}

/**
 * Records that a human sent this message.
 *
 * Re-checks consent even though the recipient is already in the list: the
 * audience was snapshotted, consent was not. Someone who unsubscribed since is
 * marked skipped instead, which is the safe direction to fail in.
 */
export async function markRecipientSentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(recipientActionSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id, campaignId } = parsed.data;

  const supabase = await createClient();

  const { data: recipient, error: readError } = await supabase
    .from("campaign_recipients")
    .select("id, status, customer:customers(marketing_consent, unsubscribed_at)")
    .eq("id", id)
    .maybeSingle();

  if (readError || !recipient) {
    logger.error("markRecipientSentAction read failed", { error: readError?.message });
    return actionError("That recipient no longer exists.");
  }

  const row = recipient as {
    id: string;
    status: string;
    customer:
      | { marketing_consent: boolean; unsubscribed_at: string | null }
      | { marketing_consent: boolean; unsubscribed_at: string | null }[]
      | null;
  };

  if (row.status === "sent") return actionSuccess("Already marked as sent.");

  const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer;
  const contactable =
    customer !== null &&
    customer !== undefined &&
    customer.marketing_consent &&
    customer.unsubscribed_at === null;

  if (!contactable) {
    await supabase
      .from("campaign_recipients")
      .update({ status: "skipped", skip_reason: customer ? "unsubscribed" : "erased" })
      .eq("id", id);

    revalidateAdmin(`${CAMPAIGNS_PATH}/${campaignId}`);

    return actionError(
      customer
        ? "This customer has unsubscribed since the list was built, so they were skipped rather than marked sent."
        : "This customer's record has been erased, so they were skipped.",
    );
  }

  const { error } = await supabase
    .from("campaign_recipients")
    .update({ status: "sent", sent_at: new Date().toISOString(), sent_by: actor.id })
    .eq("id", id);

  if (error) {
    logger.error("markRecipientSentAction failed", {
      actorId: actor.id,
      recipientId: id,
      error: error.message,
    });
    return actionError("Couldn't record that. Please try again.");
  }

  await maybeComplete(supabase, campaignId, actor.id);

  revalidateAdmin(`${CAMPAIGNS_PATH}/${campaignId}`);
  revalidateAdmin(CAMPAIGNS_PATH);

  return actionSuccess("Marked as sent.");
}

export async function skipRecipientAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(recipientActionSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id, campaignId } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaign_recipients")
    .update({ status: "skipped", skip_reason: "manual" })
    .eq("id", id);

  if (error) {
    logger.error("skipRecipientAction failed", {
      actorId: actor.id,
      recipientId: id,
      error: error.message,
    });
    return actionError("Couldn't skip that recipient. Please try again.");
  }

  await maybeComplete(supabase, campaignId, actor.id);

  revalidateAdmin(`${CAMPAIGNS_PATH}/${campaignId}`);

  return actionSuccess("Skipped.");
}

export async function cancelCampaignAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  const parsed = parseForm(campaignIdSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id } = parsed.data;

  const campaign = await getCampaignById(id);
  if (!campaign) return actionError(MISSING_ERROR);
  if (campaign.status === "completed") {
    return actionError("This campaign is already finished.");
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("message_campaigns")
    .update({ status: "cancelled", updated_at: now })
    .eq("id", id);

  if (error) {
    logger.error("cancelCampaignAction failed", {
      actorId: actor.id,
      campaignId: id,
      error: error.message,
    });
    return actionError("Couldn't cancel that campaign. Please try again.");
  }

  await recordAuditEvent({
    actorId: actor.id,
    action: "update",
    entityType: "campaign",
    entityId: id,
    before: { status: campaign.status },
    after: { status: "cancelled" },
    metadata: { unsentAtCancel: campaign.counts.pending },
  });

  revalidateAdmin(CAMPAIGNS_PATH);
  revalidateAdmin(`${CAMPAIGNS_PATH}/${id}`);

  return actionSuccess(
    campaign.counts.pending > 0
      ? `Cancelled. ${campaign.counts.pending} ${campaign.counts.pending === 1 ? "person was" : "people were"} never messaged.`
      : "Cancelled.",
  );
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Marks a campaign completed once nothing is pending.
 *
 * Counted with a HEAD query rather than re-reading the campaign, so this stays
 * cheap enough to call after every single recipient action.
 */
async function maybeComplete(
  supabase: SupabaseServerClient,
  campaignId: string,
  actorId: string,
): Promise<void> {
  const { count, error } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  if (error || count === null || count > 0) return;

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("message_campaigns")
    .update({ status: "completed", completed_at: now, updated_at: now })
    .eq("id", campaignId)
    // Only from 'sending', so a cancelled campaign is not resurrected.
    .eq("status", "sending");

  if (updateError) {
    logger.warn("maybeComplete could not finish campaign", {
      campaignId,
      error: updateError.message,
    });
    return;
  }

  await recordAuditEvent({
    actorId,
    action: "update",
    entityType: "campaign",
    entityId: campaignId,
    before: { status: "sending" },
    after: { status: "completed" },
  });
}
