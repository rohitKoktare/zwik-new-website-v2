import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { CustomerNoteForm } from "@/components/admin/customers/customer-note-form";
import { ResubscribeForm } from "@/components/admin/customers/resubscribe-form";
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
import {
  DESTRUCTIVE_ROLES,
  requireAdmin,
  type AdminRole,
} from "@/lib/auth/guard";
import { getCustomerById } from "@/lib/supabase/queries/admin-customers";
import { listOrdersForAdmin } from "@/lib/supabase/queries/admin-orders";
import {
  deleteCustomerAction,
  unsubscribeCustomerAction,
} from "@/lib/admin/customers/actions";
import { getSiteSettings } from "@/lib/supabase/queries/settings";
import { buildWaLink } from "@/lib/whatsapp";
import { parsePagination } from "@/lib/admin/pagination";
import { uuidSchema } from "@/lib/validation/common";
import { formatInr } from "@/lib/format";
import { ORDER_STATUS_LABELS } from "@/types/order";

export const metadata: Metadata = { title: "Customer" };

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireAdmin();

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const customer = await getCustomerById(id);
  if (!customer) notFound();

  const [{ orders }, settings] = await Promise.all([
    listOrdersForAdmin({
      pagination: parsePagination({ pageSize: "25" }),
      customerId: id,
    }),
    getSiteSettings(),
  ]);

  // Erasure is permanent, so the control is only rendered for roles allowed to
  // do it. deleteCustomerAction re-checks the role itself.
  const canErase = DESTRUCTIVE_ROLES.includes(profile.role as AdminRole);

  const chatLink =
    settings.whatsappEnabled && settings.whatsappNumber
      ? buildWaLink(customer.phone, "")
      : null;

  return (
    <>
      <PageHeader
        title={customer.name ?? "Customer"}
        description={`${customer.phone}${customer.cityAndPincode ? ` · ${customer.cityAndPincode}` : ""}`}
        action={
          // Base UI composes via `render`, not Radix's `asChild`.
          <Button variant="outline" render={<Link href="/admin/customers" />}>
            Back to customers
          </Button>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {customer.unsubscribedAt !== null ? (
          <Badge variant="secondary">Unsubscribed</Badge>
        ) : customer.marketingConsent ? (
          <Badge variant="default">Opted in to marketing</Badge>
        ) : (
          <Badge variant="outline">Never opted in</Badge>
        )}
        <Badge variant="outline">
          {customer.confirmedOrderCount} confirmed / {customer.orderCount} total
        </Badge>
        <span className="text-xs text-muted-foreground">
          First seen {formatDateTime(customer.createdAt)}
        </span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="grid gap-4">
          <h2 className="text-sm font-semibold tracking-tight">Orders</h2>

          {orders.length === 0 ? (
            <p className="border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No orders on this record.
            </p>
          ) : (
            <div className="border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(order.createdAt)}
                      </TableCell>
                      <TableCell>{order.itemCount}</TableCell>
                      <TableCell className="font-mono">{formatInr(order.total)}</TableCell>
                      <TableCell>
                        <Badge variant={order.status === "initiated" ? "outline" : "default"}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          render={<Link href={`/admin/orders/${order.id}`} />}
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <CustomerNoteForm customerId={customer.id} adminNote={customer.adminNote} />
        </section>

        <aside className="grid gap-4">
          <section className="grid gap-3 border border-border px-4 py-3.5">
            <h2 className="text-sm font-semibold tracking-tight">Marketing consent</h2>

            {customer.unsubscribedAt !== null ? (
              <p className="text-xs text-muted-foreground">
                Withdrawn on {formatDateTime(customer.unsubscribedAt)}. They are excluded
                from every campaign, whatever the opt-in flag says.
              </p>
            ) : customer.marketingConsent ? (
              <p className="text-xs text-muted-foreground">
                Given{" "}
                {customer.marketingConsentAt
                  ? `on ${formatDateTime(customer.marketingConsentAt)}`
                  : "(no date recorded)"}
                {customer.marketingConsentSource
                  ? ` via ${customer.marketingConsentSource}`
                  : ""}
                .
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                This customer never ticked the marketing box. Placing an order is not consent
                to marketing, so they must be excluded from campaigns. There is deliberately
                no button here to opt them in on their behalf.
              </p>
            )}

            {customer.unsubscribedAt === null && customer.marketingConsent && (
              <ConfirmAction
                action={unsubscribeCustomerAction}
                hiddenFields={{ id: customer.id }}
                trigger={
                  <Button variant="outline" size="sm">
                    Unsubscribe
                  </Button>
                }
                title="Unsubscribe this customer?"
                description="They are removed from every campaign immediately. The record keeps the fact that consent was once given, and when it was withdrawn."
                confirmLabel="Unsubscribe"
              />
            )}

            {customer.unsubscribedAt !== null && (
              <ResubscribeForm customerId={customer.id} />
            )}
          </section>

          <section className="grid gap-3 border border-border px-4 py-3.5">
            <h2 className="text-sm font-semibold tracking-tight">Contact</h2>
            {chatLink ? (
              <Button
                variant="outline"
                size="sm"
                render={<a href={chatLink} target="_blank" rel="noopener noreferrer" />}
              >
                Open WhatsApp chat
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                WhatsApp is switched off in Settings.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Opens a chat with this number. Messages are sent by you, from your device.
            </p>
          </section>

          {canErase && (
            <section className="grid gap-3 border border-destructive/40 px-4 py-3.5">
              <h2 className="text-sm font-semibold tracking-tight text-destructive">
                Erase personal data
              </h2>
              <p className="text-xs text-muted-foreground">
                Use this when a customer asks you to delete their data. The name, phone and
                city are removed permanently. Their{" "}
                {customer.orderCount === 1 ? "order" : `${customer.orderCount} orders`}{" "}
                {customer.orderCount === 1 ? "stays" : "stay"} as an anonymous sales record
                with no contact details attached.
              </p>
              <ConfirmAction
                action={deleteCustomerAction}
                hiddenFields={{ id: customer.id }}
                trigger={
                  <Button variant="outline" size="sm">
                    Erase this record
                  </Button>
                }
                title="Erase this customer's personal data?"
                description="This cannot be undone. The name, phone number and city are deleted permanently; the order history is kept without them."
                confirmLabel="Erase permanently"
                destructive
              />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
