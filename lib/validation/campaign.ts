import { z } from "zod";
import { uuidSchema } from "@/lib/validation/common";
import {
  CAMPAIGN_BODY_MAX_LENGTH,
  MAX_ENCODED_MESSAGE_LENGTH,
  fitsInWhatsAppLink,
} from "@/lib/campaigns/message";

/**
 * Campaign validation.
 *
 * The body is deliberately permissive about content — it is marketing copy, and
 * the opt-out line is appended by `buildCampaignMessage` rather than demanded
 * here, so it cannot be forgotten or removed.
 */

export const CAMPAIGN_NAME_MAX_LENGTH = 80;

export const campaignInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the campaign a name so you can find it later.")
    .max(CAMPAIGN_NAME_MAX_LENGTH, "Name is too long.")
    .refine((value) => !/[\r\n\t]/.test(value), "Name must be a single line."),

  body: z
    .string()
    .trim()
    .min(1, "Write the message.")
    .max(
      CAMPAIGN_BODY_MAX_LENGTH,
      `Keep the message under ${CAMPAIGN_BODY_MAX_LENGTH} characters.`,
    )
    /**
     * The binding check. Character count is a poor proxy: percent-encoding
     * expands non-ASCII text about ninefold, so a Hindi message well inside the
     * character cap can still overflow the URL. Checked against the worst-case
     * recipient name so a campaign cannot pass here and then fail for one
     * customer after the audience is locked in.
     */
    .refine(
      fitsInWhatsAppLink,
      `This message is too long to fit in a WhatsApp link (limit ${MAX_ENCODED_MESSAGE_LENGTH} once encoded). Non-Latin scripts take up roughly nine times more room, so shorten it.`,
    ),
});

export const campaignUpdateSchema = campaignInputSchema.extend({ id: uuidSchema });

export const campaignIdSchema = z.object({ id: uuidSchema });

export const recipientActionSchema = z.object({
  id: uuidSchema,
  campaignId: uuidSchema,
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;
