export const CAMPAIGN_STATUSES = ["draft", "sending", "completed", "cancelled"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  sending: "Sending",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const CAMPAIGN_STATUS_HINTS: Record<CampaignStatus, string> = {
  draft:
    "Still being written. No audience has been locked in and nobody can be messaged yet.",
  // "Sending" describes the admin, not the system: nothing here sends by itself.
  sending:
    "Audience locked in. Work through the list below — each message is opened in WhatsApp and sent by you.",
  completed: "Every recipient has been sent or skipped.",
  cancelled: "Abandoned. Anyone still pending was never messaged.",
};

export const RECIPIENT_STATUSES = ["pending", "sent", "skipped"] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

export type Campaign = {
  id: string;
  name: string;
  body: string;
  status: CampaignStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  counts: { total: number; pending: number; sent: number; skipped: number };
};

export type CampaignRecipient = {
  id: string;
  /** Null once the customer has been erased; such a row can never be sent to. */
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  status: RecipientStatus;
  skipReason: string | null;
  sentAt: string | null;
  /**
   * Live consent check, not the snapshot. A customer who unsubscribed after the
   * audience was locked in must not be messaged, so the UI refuses to build a
   * link when this is false.
   */
  contactable: boolean;
};
