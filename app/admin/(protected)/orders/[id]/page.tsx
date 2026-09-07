import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ConfirmAction } from "@/components/admin/confirm-action";
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
import { getOrderById } from "@/lib/supabase/queries/admin-orders";
import { setOrderStatusAction } from "@/lib/admin/orders/actions";
import { getSiteSettings } from "@/lib/supabase/queries/settings";
import { buildWaLink } from "@/lib/whatsapp";
import { uuidSchema } from "@/lib/validation/common";
import { formatInr } from "@/lib/format";
import { ORDER_STATUS_HINTS, ORDER_STATUS_LABELS } from "@/types/order";

export const metadata: Metadata = { title: "Order" };

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;

  // Route params are untrusted input (DEVELOPMENT_STANDARDS.md §7).
  if (!uuidSchema.safeParse(id).success) notFound();

  const [order, settings] = await Promise.all([getOrderById(id), getSiteSettings()]);
  if (!order) notFound();

  /**
   * Reply link, prefilled with a thank-you.
   *
   * This opens WhatsApp with the message ready to send *from ZWIK's own device*
   * — it is not an automated send, and cannot be. A `wa.me` link only opens the
   * app; sending is a human tap. Automated replies need the WhatsApp Business
   * Platform (Cloud API), which this project has no credentials for.
   */
  const thankYouMessage = [
    `Hi${order.customerName ? ` ${order.customerName}` : ""}, thank you for your ZWIK order!`,
    "",
    ...order.items.map((item) => `• ${item.name} x${item.qty} — ${formatInr(item.lineTotal)}`),
    "",
    `Items: ${formatInr(order.subtotal)}`,
    `Delivery: ${order.deliveryLabel ?? "we'll confirm"}`,
    order.deliveryCharge === null
      ? `Total so far: ${formatInr(order.total)} (before delivery)`
      : `Total: ${formatInr(order.total)}`,
    "",
    "Everything is in stock and we'll share payment details next. Any questions, just reply here.",
  ].join("\n");

  const replyLink =
    settings.whatsappEnabled && order.customerPhone
      ? buildWaLink(order.customerPhone, thankYouMessage)
      : null;

  return (
    <>
      <PageHeader
        title={`Order · ${formatDateTime(order.createdAt)}`}
        description={ORDER_STATUS_HINTS[order.status]}
        action={
          // Base UI composes via `render`, not Radix's `asChild`.
          <Button variant="outline" render={<Link href="/admin/orders" />}>
            Back to orders
          </Button>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant={order.status === "initiated" ? "outline" : "default"}>
          {ORDER_STATUS_LABELS[order.status]}
        </Badge>
        {order.giftWrap && <Badge variant="secondary">Gift wrap</Badge>}
        {order.confirmedAt && (
          <span className="text-xs text-muted-foreground">
            Confirmed {formatDateTime(order.confirmedAt)}
          </span>
        )}
        {order.cancelledAt && (
          <span className="text-xs text-muted-foreground">
            Cancelled {formatDateTime(order.cancelledAt)}
          </span>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="grid gap-4">
          <h2 className="text-sm font-semibold tracking-tight">Items</h2>

          {order.items.length === 0 ? (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              No lines were saved for this order. The header was written but the items
              failed — check the server logs for <code>order_items_write_failed</code>.
              The totals below are still the ones the customer saw.
            </p>
          ) : (
            <div className="border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead className="text-right">Line total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <span className="grid">
                          <span className="font-medium">{item.name}</span>
                          {item.sku && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {item.sku}
                            </span>
                          )}
                          {item.productId === null && (
                            <span className="text-xs text-muted-foreground">
                              product since deleted
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono">{formatInr(item.unitPrice)}</TableCell>
                      <TableCell>{item.qty}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatInr(item.lineTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="border border-border px-4 py-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Items</span>
              <span className="font-mono">{formatInr(order.subtotal)}</span>
            </div>
            <div className="mt-1.5 flex justify-between text-sm">
              <span className="text-muted-foreground">Delivery</span>
              <span className="font-mono">{order.deliveryLabel ?? "—"}</span>
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
              <span className="font-semibold">
                {order.deliveryCharge === null ? "Total so far" : "Total"}
              </span>
              <span className="font-mono text-xl font-semibold">{formatInr(order.total)}</span>
            </div>
            {order.deliveryCharge === null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Delivery was not quoted on the site, so this excludes it.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              These are the prices the customer was shown, snapshotted at hand-off. They do
              not change if the product is repriced later.
            </p>
          </div>

          {order.customerNote && (
            <div className="border border-border px-4 py-3">
              <h3 className="text-xs font-semibold tracking-tight">Customer note</h3>
              <p className="mt-1 text-sm whitespace-pre-wrap">{order.customerNote}</p>
            </div>
          )}
        </section>

        <aside className="grid gap-4">
          <section className="grid gap-3 border border-border px-4 py-3.5">
            <h2 className="text-sm font-semibold tracking-tight">Customer</h2>

            {order.customerPhone ? (
              <div className="grid gap-1 text-sm">
                <span className="font-medium">{order.customerName ?? "No name given"}</span>
                <span className="font-mono text-muted-foreground">{order.customerPhone}</span>
                {order.customerId && (
                  <Link
                    href={`/admin/customers/${order.customerId}`}
                    className="text-xs underline"
                  >
                    Open customer record
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {order.customerId === null
                  ? "No phone number was entered, so no customer record was created. The customer's number will be on their WhatsApp message."
                  : "This customer's personal data has been erased. The order is kept without contact details."}
              </p>
            )}

            {replyLink ? (
              <>
                <Button variant="outline" size="sm" render={<a href={replyLink} target="_blank" rel="noopener noreferrer" />}>
                  Open WhatsApp reply
                </Button>
                <p className="text-xs text-muted-foreground">
                  Opens WhatsApp with a thank-you and this order&rsquo;s summary ready to
                  send. You still press send — the site cannot message customers on its own.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {order.customerPhone
                  ? "WhatsApp is switched off in Settings, so no reply link can be built."
                  : "No number on file to reply to."}
              </p>
            )}
          </section>

          <section className="grid gap-3 border border-border px-4 py-3.5">
            <h2 className="text-sm font-semibold tracking-tight">Status</h2>
            <p className="text-xs text-muted-foreground">
              {ORDER_STATUS_HINTS[order.status]}
            </p>

            <div className="flex flex-wrap gap-2">
              {order.status === "initiated" && (
                <ConfirmAction
                  action={setOrderStatusAction}
                  hiddenFields={{ id: order.id, status: "confirmed" }}
                  trigger={<Button size="sm">Mark confirmed</Button>}
                  title="Confirm this order?"
                  description="Only do this once you have actually heard from the customer on WhatsApp and agreed the stock and total. The site cannot tell you whether they sent their message."
                  confirmLabel="Confirm order"
                />
              )}

              {order.status === "confirmed" && (
                <ConfirmAction
                  action={setOrderStatusAction}
                  hiddenFields={{ id: order.id, status: "fulfilled" }}
                  trigger={<Button size="sm">Mark fulfilled</Button>}
                  title="Mark this order fulfilled?"
                  description="Use this once it is paid and shipped. Fulfilled orders cannot be changed afterwards."
                  confirmLabel="Mark fulfilled"
                />
              )}

              {order.status === "cancelled" && (
                <ConfirmAction
                  action={setOrderStatusAction}
                  hiddenFields={{ id: order.id, status: "confirmed" }}
                  trigger={
                    <Button variant="outline" size="sm">
                      Reopen as confirmed
                    </Button>
                  }
                  title="Reopen this order?"
                  description="The order goes back to confirmed and the cancellation date is cleared."
                  confirmLabel="Reopen order"
                />
              )}

              {order.status !== "cancelled" && order.status !== "fulfilled" && (
                <ConfirmAction
                  action={setOrderStatusAction}
                  hiddenFields={{ id: order.id, status: "cancelled" }}
                  trigger={
                    <Button variant="outline" size="sm">
                      Cancel
                    </Button>
                  }
                  title="Cancel this order?"
                  description="Nothing is deleted — the record stays and you can reopen it later."
                  confirmLabel="Cancel order"
                />
              )}

              {order.status === "fulfilled" && (
                <p className="text-xs text-muted-foreground">
                  Fulfilled is final. Anything further is a conversation with the customer.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
