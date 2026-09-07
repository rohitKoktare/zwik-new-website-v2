"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedActor } from "@/lib/auth/guard";
import { getOrderById } from "@/lib/supabase/queries/admin-orders";
import { diffRecords, recordAuditEvent } from "@/lib/audit";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { logger } from "@/lib/logger";
import { uuidSchema } from "@/lib/validation/common";
import {
  actionError,
  actionSuccess,
  parseForm,
  type ActionResult,
} from "@/lib/admin/action-result";
import { ORDER_STATUSES, type OrderStatus } from "@/types/order";

/**
 * Order status transitions. Follows the house order: authorize, validate, read
 * before, write, audit, revalidate, return.
 *
 * Orders are not archived like editorial content — they are a business record,
 * and `cancelled` is the terminal "not going ahead" state rather than a soft
 * delete. There is deliberately no delete action here: erasing a *person* is
 * handled by deleting the customer (see lib/admin/customers/actions.ts), which
 * anonymises their orders while keeping the sales history.
 *
 * Nothing on the public site renders orders, so no public path is revalidated.
 */

const ORDERS_PATH = "/admin/orders";
const PERMISSION_ERROR = "You don't have permission to change orders.";
const MISSING_ERROR = "That order no longer exists.";

const statusChangeSchema = z.object({
  id: uuidSchema,
  status: z.enum(ORDER_STATUSES),
});

/**
 * Which transitions are allowed.
 *
 * `initiated` means the site composed the order and handed it to WhatsApp; it
 * does NOT mean the customer sent the message. Confirming is therefore a human
 * judgement that requires having actually heard from them, which is why it can
 * never happen automatically.
 *
 * `fulfilled` is only reachable from `confirmed`: shipping something nobody
 * confirmed would be a mistake worth blocking rather than warning about.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  initiated: ["confirmed", "cancelled"],
  confirmed: ["fulfilled", "cancelled"],
  // Reopening a cancelled order is legitimate — a customer changes their mind.
  cancelled: ["confirmed"],
  // Terminal. Undoing a shipment is a conversation, not a button.
  fulfilled: [],
};

const SUCCESS_MESSAGES: Record<OrderStatus, string> = {
  initiated: "Order moved back to started.",
  confirmed: "Order confirmed. Stock and total are agreed with the customer.",
  cancelled: "Order cancelled.",
  fulfilled: "Order marked fulfilled.",
};

export async function setOrderStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Authorize.
  const actor = await getAuthorizedActor();
  if (!actor) return actionError(PERMISSION_ERROR);

  // 2. Validate.
  const parsed = parseForm(statusChangeSchema, formData);
  if (!parsed.success) return parsed.result;
  const { id, status } = parsed.data;

  // 3. Before state.
  const before = await getOrderById(id);
  if (!before) return actionError(MISSING_ERROR);

  if (before.status === status) {
    return actionSuccess(`This order is already ${status}.`);
  }

  if (!ALLOWED_TRANSITIONS[before.status].includes(status)) {
    return actionError(
      before.status === "fulfilled"
        ? "A fulfilled order cannot be changed. Sort it out with the customer on WhatsApp instead."
        : `An order cannot go from ${before.status} to ${status}.`,
    );
  }

  // 4. Write. The timestamps record when each decision was actually made, and
  //    are cleared on the way out of a state so a reopened order does not keep
  //    a stale cancellation date.
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { status, updated_at: now };

  if (status === "confirmed") {
    row.confirmed_at = before.confirmedAt ?? now;
    row.cancelled_at = null;
  }
  if (status === "cancelled") row.cancelled_at = now;
  if (status === "initiated") {
    row.confirmed_at = null;
    row.cancelled_at = null;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("orders").update(row).eq("id", id);

  if (error) {
    logger.error("setOrderStatusAction failed", {
      actorId: actor.id,
      orderId: id,
      error: error.message,
    });
    return actionError("Couldn't update that order. Please try again.");
  }

  // 5. Audit. Money is included because a confirmation is the moment ZWIK
  //    commits to a total.
  const { before: beforeDiff, after: afterDiff } = diffRecords(
    { status: before.status },
    { status },
  );

  await recordAuditEvent({
    actorId: actor.id,
    action: "update",
    entityType: "order",
    entityId: id,
    before: beforeDiff,
    after: afterDiff,
    metadata: { total: before.total, currency: before.currency, items: before.itemCount },
  });

  // 6. Revalidate. No public page renders orders.
  revalidateAdmin(ORDERS_PATH);
  revalidateAdmin(`${ORDERS_PATH}/${id}`);

  // 7. Result.
  return actionSuccess(SUCCESS_MESSAGES[status]);
}
