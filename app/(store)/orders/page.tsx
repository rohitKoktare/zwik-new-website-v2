import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/lib/customer-auth/guard";
import { signOutCustomerAction } from "@/lib/customer-auth/actions";
import { getOrdersForCustomer } from "@/lib/supabase/queries/customer-orders";
import { formatInr } from "@/lib/format";
import { ORDER_STATUS_CUSTOMER_LABELS } from "@/types/order";

/**
 * Session-dependent — must never be crawled or enter the (store) layout's
 * hourly ISR cache, same reasoning as `/orders/[token]` and `/orders/login`.
 */
export const metadata: Metadata = {
  title: "Your orders",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function CustomerOrdersPage() {
  const customer = await requireCustomer();
  const orders = await getOrdersForCustomer(customer.id);

  return (
    <section className="px-6 py-14 md:px-12 md:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] tracking-[1.4px] text-[var(--text-secondary)] uppercase">
              Signed in as {customer.phone}
            </div>
            <h1 className="mt-2 text-[clamp(28px,3.5vw,40px)] leading-[0.98] font-semibold tracking-[-0.03em]">
              Your orders
            </h1>
          </div>
          <form action={signOutCustomerAction}>
            <button
              type="submit"
              className="h-10 border border-[var(--gray-100)] px-5 text-sm font-medium text-[var(--gray-100)] transition-colors duration-150 hover:bg-[var(--gray-100)] hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>

        {orders.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--text-secondary)]">
            We couldn&rsquo;t find any orders for this number yet. Placed one recently?
            Message us and we&rsquo;ll look it up.
          </p>
        ) : (
          <div className="mt-8 border border-[var(--gray-20)]">
            {orders.map((order) => (
              <Link
                key={order.orderNumber}
                href={`/orders/${order.publicToken}`}
                className="flex items-center justify-between gap-4 border-b border-[var(--gray-20)] p-4 transition-colors duration-150 last:border-b-0 hover:bg-[var(--gray-10)] hover:no-underline"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold">{order.orderNumber}</div>
                  <div className="mt-1 font-mono text-[11px] tracking-[1.2px] text-[var(--text-secondary)] uppercase">
                    {formatDate(order.placedAt)} · {ORDER_STATUS_CUSTOMER_LABELS[order.status]}
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold whitespace-nowrap">
                  {order.totalProvisional ? "From " : ""}
                  {formatInr(order.total)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
