import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guard";
import { parsePagination, totalPages } from "@/lib/admin/pagination";
import {
  countOrdersByStatus,
  listOrdersForAdmin,
  parseOrderStatusFilter,
} from "@/lib/supabase/queries/admin-orders";
import { formatInr, ordinalSuffix } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/types/order";
import type { OrderStatus } from "@/types/order";

export const metadata: Metadata = { title: "Orders" };

const ORDERS_PATH = "/admin/orders";

/** Native select styled to match components/ui/input. */
const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

const STATUS_VARIANTS: Record<OrderStatus, "default" | "secondary" | "outline"> = {
  initiated: "outline",
  confirmed: "default",
  cancelled: "secondary",
  fulfilled: "default",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type OrdersSearchParams = {
  page?: string;
  pageSize?: string;
  status?: string;
  q?: string;
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<OrdersSearchParams>;
}) {
  // Page-level gate. Every action re-checks, and RLS blocks non-admins anyway.
  await requireAdmin();

  const params = await searchParams;

  // Query params are untrusted input (DEVELOPMENT_STANDARDS.md §7).
  const pagination = parsePagination(params);
  const status = parseOrderStatusFilter(params.status);
  const search = params.q?.trim().slice(0, 40) || undefined;

  const [{ orders, totalCount }, counts] = await Promise.all([
    listOrdersForAdmin({ pagination, status, search }),
    countOrdersByStatus(),
  ]);

  const pageCount = totalPages(totalCount, pagination.pageSize);
  const hasFilters = Boolean(status || search);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every cart handed off to WhatsApp. An order starts as “Started on site” — the site cannot tell whether the customer actually pressed send, so treat it as an enquiry until you have their message."
      />

      <div className="mt-6 flex flex-wrap gap-2">
        {ORDER_STATUSES.map((value) => (
          <Button
            key={value}
            variant={status === value ? "default" : "outline"}
            size="sm"
            render={
              <Link
                href={status === value ? ORDERS_PATH : `${ORDERS_PATH}?status=${value}`}
              />
            }
          >
            {ORDER_STATUS_LABELS[value]} ({counts[value]})
          </Button>
        ))}
      </div>

      <form method="get" action={ORDERS_PATH} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="q">Phone or order number</Label>
          <Input
            id="q"
            name="q"
            defaultValue={search ?? ""}
            placeholder="9876543210 or ZW-2609-0042"
            className="font-mono sm:w-52"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className={`${SELECT_CLASS} sm:w-44`}
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" variant="outline">
          Apply filters
        </Button>

        {hasFilters && (
          <Button variant="ghost" render={<Link href={ORDERS_PATH} />}>
            Clear
          </Button>
        )}
      </form>

      {orders.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={hasFilters ? "No orders match these filters" : "No orders yet"}
            description={
              hasFilters
                ? "Try a different phone number or status."
                : "Orders appear here as soon as a customer taps “Send this order on WhatsApp”."
            }
            action={
              hasFilters ? (
                <Button variant="outline" render={<Link href={ORDERS_PATH} />}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-6 border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {order.orderNumber}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {formatDateTime(order.createdAt)}
                    </TableCell>

                    <TableCell>
                      {order.customerPhone ? (
                        <span className="grid">
                          <span className="font-medium">
                            {order.customerName ?? "No name given"}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {order.customerPhone}
                          </span>
                          {/* Counts only orders already confirmed or fulfilled,
                              excluding this one — an unconfirmed order may
                              never have been real. */}
                          {order.repeatCustomer && (
                            <span className="mt-0.5">
                              <Badge variant="outline">
                                Repeat · {order.priorConfirmedOrders + 1}
                                {ordinalSuffix(order.priorConfirmedOrders + 1)} order
                              </Badge>
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {order.customerId === null
                            ? "No contact captured"
                            : "Record erased"}
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      {order.itemCount}
                      {order.items.length === 0 && (
                        <span className="ml-1.5 text-xs text-destructive">
                          no lines saved
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="font-mono">
                      {formatInr(order.total)}
                      {order.deliveryCharge === null && (
                        <span className="block text-xs font-sans text-muted-foreground">
                          before delivery
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[order.status]}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={`${ORDERS_PATH}/${order.id}`} />}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4">
            <PaginationControls
              basePath={ORDERS_PATH}
              page={pagination.page}
              pageCount={pageCount}
              totalCount={totalCount}
              searchParams={{ status, q: search, pageSize: params.pageSize }}
            />
          </div>
        </>
      )}
    </>
  );
}
