import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/validation/env";
import { logQueryFailure } from "@/lib/supabase/pending-migration";
import type { Pagination } from "@/lib/admin/pagination";
import { canReceiveMarketing } from "@/types/customer";
import type {
  Campaign,
  CampaignRecipient,
  CampaignStatus,
  RecipientStatus,
} from "@/types/campaign";

/**
 * Admin campaign reads.
 *
 * Recipients join to `customers`, so every query here goes through the
 * RLS-enforced client and both tables are admin-only (migration 0013).
 */

type CampaignRow = {
  id: string;
  name: string;
  body: string;
  status: CampaignStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  campaign_recipients: { status: RecipientStatus }[] | null;
};

const CAMPAIGN_SELECT =
  "id, name, body, status, created_at, started_at, completed_at, campaign_recipients(status)";

function toCampaign(row: CampaignRow): Campaign {
  const recipients = row.campaign_recipients ?? [];

  return {
    id: row.id,
    name: row.name,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    counts: {
      total: recipients.length,
      pending: recipients.filter((r) => r.status === "pending").length,
      sent: recipients.filter((r) => r.status === "sent").length,
      skipped: recipients.filter((r) => r.status === "skipped").length,
    },
  };
}

export async function listCampaignsForAdmin(options: {
  pagination: Pagination;
}): Promise<{ campaigns: Campaign[]; totalCount: number }> {
  if (!isSupabaseConfigured) return { campaigns: [], totalCount: 0 };

  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("message_campaigns")
    .select(CAMPAIGN_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(options.pagination.from, options.pagination.to);

  if (error) {
    logQueryFailure("listCampaignsForAdmin", error, "message_campaigns");
    return { campaigns: [], totalCount: 0 };
  }

  return {
    campaigns: ((data ?? []) as unknown as CampaignRow[]).map(toCampaign),
    totalCount: count ?? 0,
  };
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logQueryFailure("getCampaignById", error, "message_campaigns");
    return null;
  }

  return data ? toCampaign(data as unknown as CampaignRow) : null;
}

type RecipientRow = {
  id: string;
  customer_id: string | null;
  status: RecipientStatus;
  skip_reason: string | null;
  sent_at: string | null;
  customer:
    | {
        id: string;
        name: string | null;
        phone: string;
        marketing_consent: boolean;
        unsubscribed_at: string | null;
      }
    | {
        id: string;
        name: string | null;
        phone: string;
        marketing_consent: boolean;
        unsubscribed_at: string | null;
      }[]
    | null;
};

const RECIPIENT_SELECT = `
  id, customer_id, status, skip_reason, sent_at,
  customer:customers(id, name, phone, marketing_consent, unsubscribed_at)
`;

/** PostgREST embeds a to-one relation as an object or a single-item array. */
function firstOrNull<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

/**
 * Recipients for one campaign.
 *
 * `contactable` is computed from the customer's CURRENT consent, not from
 * whatever was true when the audience was snapshotted. Someone who unsubscribed
 * in between must not be messaged, and the UI uses this to refuse to build a
 * link for them.
 */
export async function listCampaignRecipients(options: {
  campaignId: string;
  pagination: Pagination;
  status?: RecipientStatus;
}): Promise<{ recipients: CampaignRecipient[]; totalCount: number }> {
  if (!isSupabaseConfigured) return { recipients: [], totalCount: 0 };

  const supabase = await createClient();
  let query = supabase
    .from("campaign_recipients")
    .select(RECIPIENT_SELECT, { count: "exact" })
    .eq("campaign_id", options.campaignId)
    // Pending first so the admin's worklist is the top of the page.
    .order("status", { ascending: true })
    .order("created_at", { ascending: true })
    .range(options.pagination.from, options.pagination.to);

  if (options.status) query = query.eq("status", options.status);

  const { data, error, count } = await query;

  if (error) {
    logQueryFailure("listCampaignRecipients", error, "campaign_recipients");
    return { recipients: [], totalCount: 0 };
  }

  const recipients = ((data ?? []) as unknown as RecipientRow[]).map((row) => {
    const customer = firstOrNull(row.customer);

    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      status: row.status,
      skipReason: row.skip_reason,
      sentAt: row.sent_at,
      // An erased customer (null) is never contactable.
      contactable: customer
        ? canReceiveMarketing({
            marketingConsent: customer.marketing_consent,
            unsubscribedAt: customer.unsubscribed_at,
          })
        : false,
    } satisfies CampaignRecipient;
  });

  return { recipients, totalCount: count ?? 0 };
}
