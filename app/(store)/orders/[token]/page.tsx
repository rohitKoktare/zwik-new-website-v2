import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByPublicToken } from "@/lib/store/orders/lookup";
import { getSiteSettings } from "@/lib/supabase/queries/settings";
import { buildWaLink } from "@/lib/whatsapp";
import { formatInr } from "@/lib/format";
import {
  ORDER_STATUS_CUSTOMER_HINTS,
  ORDER_STATUS_CUSTOMER_LABELS,
  type OrderStatus,
} from "@/types/order";

/**
 * The customer's tracking page, reached by the capability token in their link.
 *
 * `noindex` and never statically rendered: the URL contains a secret, so it
 * must not be crawled, cached at the edge, or prerendered.
 */
export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

/**
 * Never cached. The `(store)` layout sets `revalidate = 3600`, which would
 * otherwise put a page whose URL is a credential into the ISR cache for an
 * hour — and serve a stale order status with it.
 */
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<OrderStatus, string> = {
  initiated: "bg-[var(--yellow-30)] text-[var(--gray-100)]",
  confirmed: "bg-[var(--teal-60)] text-white",
  cancelled: "bg-[var(--gray-30)] text-[var(--gray-100)]",
  fulfilled: "bg-[var(--teal-60)] text-white",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [order, settings] = await Promise.all([
    getOrderByPublicToken(token),
    getSiteSettings(),
  ]);

  /*
   * Unknown, malformed, or belonging to an erased customer — all the same
   * not-found, deliberately indistinguishable. Saying which would confirm that
   * a record once existed.
   *
   * This renders the not-found UI but the HTTP status stays 200, which is
   * documented behaviour rather than a bug: because this route streams, the
   * response headers are already sent by the time `notFound()` runs, so the
   * status cannot be changed (see next/dist/docs — not-found.md and
   * loading.md#status-codes). Next injects `<meta robots="noindex">` into
   * streamed 404s, and this page sets `noindex` anyway, so nothing gets
   * indexed. Getting a true 404 would mean querying the token in `proxy` on
   * every request, which those same docs warn against — not worth a DB round
   * trip in middleware for a status code no user sees.
   */
  if (!order) notFound();

  const waLink =
    settings.whatsappEnabled && settings.whatsappNumber
      ? buildWaLink(
          settings.whatsappNumber,
          `Hi ZWIK, a question about my order ${order.orderNumber}.`,
        )
      : null;

  return (
    <section className="px-6 py-14 md:px-12 md:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="font-mono text-[11px] tracking-[1.4px] text-[var(--text-secondary)] uppercase">
          Order {order.orderNumber} · placed {formatDate(order.placedAt)}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-[clamp(32px,4vw,48px)] leading-[0.98] font-semibold tracking-[-0.03em]">
            Your order
          </h1>
          <span
            className={`px-2.5 py-1 font-mono text-[11px] tracking-[1.4px] uppercase ${STATUS_TONE[order.status]}`}
          >
            {ORDER_STATUS_CUSTOMER_LABELS[order.status]}
          </span>
        </div>

        <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-[var(--text-secondary)]">
          {ORDER_STATUS_CUSTOMER_HINTS[order.status]}
        </p>

        <div className="mt-8 border border-[var(--gray-20)]">
          {order.items.length === 0 ? (
            <p className="p-4 text-sm text-[var(--text-secondary)]">
              We couldn&rsquo;t load the items on this order. Message us and we&rsquo;ll read
              them out.
            </p>
          ) : (
            order.items.map((item, i) => (
              <div
                key={`${item.sku ?? item.name}-${i}`}
                className="flex items-start justify-between gap-4 border-b border-[var(--gray-20)] p-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="text-[15px] leading-tight font-semibold">{item.name}</div>
                  <div className="mt-1 font-mono text-[11px] tracking-[1.2px] text-[var(--text-secondary)] uppercase">
                    {item.sku ? `${item.sku} · ` : ""}
                    {formatInr(item.unitPrice)} × {item.qty}
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold whitespace-nowrap">
                  {formatInr(item.lineTotal)}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 border border-[var(--gray-20)] px-4 py-3.5">
          <div className="flex justify-between text-sm text-[var(--text-secondary)]">
            <span>Items</span>
            <span className="font-mono">{formatInr(order.subtotal)}</span>
          </div>
          <div className="mt-1.5 flex justify-between text-sm text-[var(--text-secondary)]">
            <span>Delivery</span>
            <span className="font-mono">{order.deliveryLabel ?? "—"}</span>
          </div>
          {order.giftWrap && (
            <div className="mt-1.5 flex justify-between text-sm text-[var(--text-secondary)]">
              <span>Gift wrap</span>
              <span>Included, free</span>
            </div>
          )}
          <div className="mt-3.5 flex items-baseline justify-between border-t border-[var(--gray-100)] pt-3.5">
            <span className="text-base font-semibold">
              {order.totalProvisional ? "Total so far" : "Total"}
            </span>
            <span className="font-mono text-2xl leading-tight font-semibold">
              {formatInr(order.total)}
            </span>
          </div>
          {order.totalProvisional && (
            <p className="mt-1 text-[13px] leading-snug text-[var(--text-secondary)]">
              Delivery isn&rsquo;t included yet — we confirm it with you on WhatsApp.
            </p>
          )}
        </div>

        {/* Must not imply the order is paid or reserved (ARCHITECTURE.md §18). */}
        <p className="mt-4 text-[13px] leading-snug text-[var(--text-secondary)]">
          Nothing has been charged. We confirm availability and the final total with you on
          WhatsApp before any payment.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-13 items-center bg-[var(--magenta-60)] px-7 text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[var(--purple-60)] hover:no-underline"
            >
              Ask about this order
            </a>
          )}
          <Link
            href="/products"
            className="flex h-13 items-center border border-[var(--gray-100)] px-7 text-[15px] font-medium text-[var(--gray-100)] transition-colors duration-150 hover:bg-[var(--gray-100)] hover:text-white hover:no-underline"
          >
            Keep browsing
          </Link>
        </div>

        <p className="mt-6 font-mono text-[11px] tracking-[1.2px] text-[var(--text-helper)] uppercase">
          Keep this link private — it opens your order
        </p>
      </div>
    </section>
  );
}
