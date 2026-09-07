/**
 * Campaign message building.
 *
 * One module so the preview an admin approves and the text actually put into a
 * wa.me link are produced by the same code. If they could diverge, the approval
 * step would be meaningless.
 */

/**
 * Appended to every campaign message, always, and not editable.
 *
 * Not politeness — an opt-out path is required by Meta's Business Messaging
 * Policy, and by the consent model these campaigns run on (a consent you cannot
 * withdraw is not consent). Making it part of message building rather than a
 * field someone can clear is what guarantees it is present on every send.
 */
export const OPT_OUT_LINE = "Reply STOP and we won't message you again.";

/** Token an admin may put in the body to address the customer by name. */
export const NAME_TOKEN = "{name}";

/**
 * Coarse character guard against a pasted essay. NOT the real limit — see
 * `MAX_ENCODED_MESSAGE_LENGTH`, which is what actually constrains the message.
 */
export const CAMPAIGN_BODY_MAX_LENGTH = 900;

/**
 * The real constraint: how long the message may be once percent-encoded into
 * the `wa.me?text=` query string.
 *
 * Counting characters is the wrong unit. `encodeURIComponent` expands each
 * non-ASCII character to three bytes and each byte to three characters, so one
 * Devanagari character costs nine — 900 characters of Hindi encode to over 8,000,
 * far past the ~2,048 length that is safe across browsers and that WhatsApp
 * reliably accepts. A Latin message of the same 900 characters encodes to about
 * 900 and is completely fine.
 *
 * So the budget is measured on the encoded form. A Hindi or Marathi campaign
 * gets a shorter character allowance than an English one, which is correct:
 * they cost more to transmit.
 *
 * 4,000 rather than the often-quoted 2,048: that figure is an old IE and
 * server-side URL limit, and every current browser handles a far longer `href`.
 * 4,000 keeps the whole URL around 4KB, which is comfortable everywhere, while
 * still leaving room for a ~400-character Devanagari message.
 */
export const MAX_ENCODED_MESSAGE_LENGTH = 4000;

/**
 * Name length assumed when estimating the worst case.
 *
 * A stated assumption, not the column limit. `customers.name` is free text and
 * the cart accepts up to 80 characters, but budgeting for 80 characters of a
 * three-byte script — 720 encoded characters *per `{name}` token* — rejects
 * perfectly reasonable messages. 30 is already generous for a real name and
 * leaves the estimate useful.
 *
 * The residual risk is a message that fits the estimate but overflows for one
 * customer with an unusually long name in a non-Latin script. That produces a
 * long URL, not a broken one, so it is the right way round.
 */
const WORST_CASE_NAME_LENGTH = 30;

/**
 * Fills the body for one recipient and appends the opt-out line.
 *
 * `{name}` falls back to a neutral greeting rather than leaving a literal
 * "{name}" or an awkward empty gap — a name is optional on a customer record,
 * so the fallback path is normal, not exceptional.
 */
export function buildCampaignMessage(body: string, customerName: string | null): string {
  const name = customerName?.trim();
  const filled = body.split(NAME_TOKEN).join(name && name.length > 0 ? name : "there");

  // Guard against an admin who typed the opt-out line themselves — one copy.
  const alreadyPresent = filled.toLowerCase().includes("reply stop");

  return alreadyPresent ? filled : `${filled}\n\n${OPT_OUT_LINE}`;
}

/** Preview text, using a placeholder name so the token is visibly working. */
export function previewCampaignMessage(body: string): string {
  return buildCampaignMessage(body, "Asha");
}

/**
 * Encoded length of the longest message this body could produce.
 *
 * Assumes the worst case rather than the current recipient: the opt-out line is
 * appended, and `{name}` is filled with a maximum-length name. Validating
 * against the average would let a campaign pass and then fail for the one
 * customer with a long name — after the audience was already locked in.
 */
export function worstCaseEncodedLength(body: string): number {
  const worstName = "क".repeat(WORST_CASE_NAME_LENGTH);
  return encodeURIComponent(buildCampaignMessage(body, worstName)).length;
}

/** Whether this body fits in a wa.me link for every possible recipient. */
export function fitsInWhatsAppLink(body: string): boolean {
  return worstCaseEncodedLength(body) <= MAX_ENCODED_MESSAGE_LENGTH;
}
