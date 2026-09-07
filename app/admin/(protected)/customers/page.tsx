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
  countContactableCustomers,
  listCustomersForAdmin,
  parseCustomerFilter,
} from "@/lib/supabase/queries/admin-customers";
import { formatInr } from "@/lib/format";

export const metadata: Metadata = { title: "Customers" };

const CUSTOMERS_PATH = "/admin/customers";

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

const FILTER_OPTIONS = [
  { value: "", label: "Everyone" },
  { value: "consented", label: "Can be messaged" },
  { value: "no-consent", label: "Never opted in" },
  { value: "unsubscribed", label: "Unsubscribed" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type CustomersSearchParams = {
  page?: string;
  pageSize?: string;
  filter?: string;
  q?: string;
};

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<CustomersSearchParams>;
}) {
  await requireAdmin();

  const params = await searchParams;

  // Query params are untrusted input (DEVELOPMENT_STANDARDS.md §7).
  const pagination = parsePagination(params);
  const filter = parseCustomerFilter(params.filter);
  const search = params.q?.trim().slice(0, 40) || undefined;

  const [{ customers, totalCount }, audience] = await Promise.all([
    listCustomersForAdmin({ pagination, filter, search }),
    countContactableCustomers(),
  ]);

  const pageCount = totalPages(totalCount, pagination.pageSize);
  const hasFilters = Boolean(filter || search);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Built from the phone numbers customers type into the cart. This is personal data — it is never shown on the public site, and deleting a record erases it for good."
      />

      <div className="mt-6 grid gap-3 border border-border px-4 py-3 sm:grid-cols-2">
        <div>
          <div className="font-mono text-2xl font-semibold">{audience.contactable}</div>
          <p className="text-xs text-muted-foreground">
            can be messaged — opted in and not unsubscribed
          </p>
        </div>
        <div>
          <div className="font-mono text-2xl font-semibold">{audience.total}</div>
          <p className="text-xs text-muted-foreground">
            records in total. The rest never opted in, and campaigns must skip them.
          </p>
        </div>
      </div>

      <form method="get" action={CUSTOMERS_PATH} className="mt-6 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Phone or name"
            className="sm:w-52"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="filter">Consent</Label>
          <select
            id="filter"
            name="filter"
            defaultValue={filter ?? ""}
            className={`${SELECT_CLASS} sm:w-48`}
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" variant="outline">
          Apply filters
        </Button>

        {hasFilters && (
          <Button variant="ghost" render={<Link href={CUSTOMERS_PATH} />}>
            Clear
          </Button>
        )}
      </form>

      {customers.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={hasFilters ? "No customers match these filters" : "No customer records yet"}
            description={
              hasFilters
                ? "Try a different search or consent filter."
                : "A record is created when a customer enters their phone number in the cart and hands the order to WhatsApp."
            }
            action={
              hasFilters ? (
                <Button variant="outline" render={<Link href={CUSTOMERS_PATH} />}>
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
                  <TableHead>Customer</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Confirmed value</TableHead>
                  <TableHead>Marketing</TableHead>
                  <TableHead>First seen</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <span className="grid">
                        <span className="font-medium">{customer.name ?? "No name given"}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {customer.phone}
                        </span>
                        {customer.cityAndPincode && (
                          <span className="text-xs text-muted-foreground">
                            {customer.cityAndPincode}
                          </span>
                        )}
                      </span>
                    </TableCell>

                    <TableCell>
                      {customer.confirmedOrderCount}
                      {customer.orderCount !== customer.confirmedOrderCount && (
                        <span className="text-muted-foreground">
                          {" "}
                          / {customer.orderCount}
                        </span>
                      )}
                      {customer.lastOrderAt && (
                        <span className="block text-xs text-muted-foreground">
                          last {formatDate(customer.lastOrderAt)}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="font-mono">
                      {formatInr(customer.confirmedTotal)}
                    </TableCell>

                    <TableCell>
                      {customer.unsubscribedAt !== null ? (
                        <Badge variant="secondary">Unsubscribed</Badge>
                      ) : customer.marketingConsent ? (
                        <Badge variant="default">Opted in</Badge>
                      ) : (
                        <Badge variant="outline">Not opted in</Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {formatDate(customer.createdAt)}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={`${CUSTOMERS_PATH}/${customer.id}`} />}
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
              basePath={CUSTOMERS_PATH}
              page={pagination.page}
              pageCount={pageCount}
              totalCount={totalCount}
              searchParams={{ filter, q: search, pageSize: params.pageSize }}
            />
          </div>
        </>
      )}
    </>
  );
}
