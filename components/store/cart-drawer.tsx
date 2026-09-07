"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/store/cart-provider";
import { buildOrderMessage, buildWaLink } from "@/lib/whatsapp";
import { formatInr } from "@/lib/format";
import {
  getDeliveryProgress,
  getDeliveryQuote,
  type DeliveryTerms,
} from "@/lib/store/delivery";
import { captureOrderAction } from "@/lib/store/orders/capture";

export function CartDrawer({
  whatsappNumber,
  delivery,
}: {
  whatsappNumber: string | null;
  /** Admin-configured delivery terms. Previously hard-coded here. */
  delivery: DeliveryTerms;
}) {
  const { lines, isOpen, closeCart, setQty, removeLine, subtotal } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cityAndPincode, setCityAndPincode] = useState("");
  const [note, setNote] = useState("");
  const [giftWrap, setGiftWrap] = useState(true);
  // Marketing opt-in. Unticked by default and never pre-checked: consent has to
  // be an act, not a default someone forgot to undo.
  const [marketingConsent, setMarketingConsent] = useState(false);

  if (!isOpen) return null;

  const hasItems = lines.length > 0;
  const quote = getDeliveryQuote(delivery, subtotal);
  const progress = getDeliveryProgress(delivery, subtotal);

  const orderMessage = buildOrderMessage({
    lines,
    giftWrap,
    customer: { name, phone, cityAndPincode, note },
    // The same resolved quote the customer is looking at, so the WhatsApp
    // message cannot state a different delivery charge or total.
    delivery: quote,
  });
  const waOrderLink = whatsappNumber ? buildWaLink(whatsappNumber, orderMessage) : null;

  /**
   * Records the order as the customer leaves for WhatsApp.
   *
   * Deliberately fired from the anchor's onClick *without* preventDefault, and
   * deliberately not awaited. Two reasons:
   *
   *   - Awaiting an async call before opening the link would sever it from the
   *     user gesture, and the browser's popup blocker would eat the new tab.
   *   - The order hand-off must not depend on our bookkeeping succeeding
   *     (ARCHITECTURE.md §1). If the capture fails the customer still reaches
   *     WhatsApp; the failure is logged server-side, not shown to them.
   *
   * The page stays alive because the link opens in a new tab, so the request
   * completes.
   */
  function recordOrder() {
    void captureOrderAction({
      // Prices are intentionally not sent — the server re-reads them.
      lines: lines.map((line) => ({ productId: line.productId, qty: line.qty })),
      phone,
      name,
      cityAndPincode,
      note,
      giftWrap,
      marketingConsent,
    }).catch(() => {
      // Swallowed on purpose. The customer is already on their way to
      // WhatsApp and cannot act on a database problem.
    });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Your order">
      <div
        onClick={closeCart}
        className="fixed inset-0 z-50 bg-[rgba(22,22,22,0.5)]"
        aria-hidden
      />
      <aside className="fixed top-0 right-0 bottom-0 z-51 flex w-full max-w-[460px] flex-col bg-white shadow-[0_4px_16px_rgba(0,0,0,0.24)]">
        <div className="flex h-[60px] items-center justify-between bg-[var(--gray-100)] px-5 pr-3 text-white">
          <span className="font-mono text-xs tracking-[1.6px] uppercase">
            Your order · {lines.reduce((n, l) => n + l.qty, 0)} {lines.length === 1 ? "piece" : "pieces"}
          </span>
          <button
            type="button"
            onClick={closeCart}
            aria-label="Close cart"
            className="flex h-10 w-10 items-center justify-center text-lg hover:bg-[var(--magenta-60)]"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {lines.map((line) => (
            <div key={line.productId} className="grid grid-cols-[88px_1fr] gap-3.5 border-b border-[var(--gray-20)] p-4">
              <div className="relative aspect-square bg-[var(--gray-10)]">
                {line.imageUrl && (
                  <Image src={line.imageUrl} alt={line.name} fill sizes="88px" className="object-cover" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2.5">
                  <span className="min-w-0 text-[15px] leading-tight font-semibold">{line.name}</span>
                  <span className="font-mono text-sm font-semibold whitespace-nowrap">
                    {formatInr(line.price * line.qty)}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px] tracking-[1.2px] text-[var(--text-secondary)] uppercase">
                  {line.sku} · {formatInr(line.price)} each
                </div>
                <div className="mt-2.5 flex items-center gap-3.5">
                  <div className="flex items-center border border-[var(--gray-20)]">
                    <button
                      type="button"
                      onClick={() => setQty(line.productId, line.qty - 1)}
                      className="flex h-8 w-8 items-center justify-center text-[var(--gray-100)] hover:bg-[var(--layer-hover-01)]"
                      aria-label={`Decrease quantity of ${line.name}`}
                    >
                      −
                    </button>
                    <span className="min-w-7 text-center font-mono text-[13px]">{line.qty}</span>
                    <button
                      type="button"
                      onClick={() => setQty(line.productId, line.qty + 1)}
                      className="flex h-8 w-8 items-center justify-center text-[var(--gray-100)] hover:bg-[var(--layer-hover-01)]"
                      aria-label={`Increase quantity of ${line.name}`}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.productId)}
                    className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--red-60)] hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!hasItems && (
            <div className="p-18 text-center">
              <div className="text-[19px] leading-tight font-semibold">Your cart is empty</div>
              <p className="mt-2 mb-5.5 text-sm text-[var(--text-secondary)]">
                Add a piece from the catalog and it&apos;ll show up here.
              </p>
              <Link
                href="/products"
                onClick={closeCart}
                className="inline-flex h-11 items-center bg-[var(--gray-100)] px-6.5 text-sm text-white hover:bg-[var(--magenta-60)]"
              >
                Browse the catalog
              </Link>
            </div>
          )}

          {hasItems && (
            <div className="grid gap-3.5 bg-[var(--gray-10)] px-4 pt-5 pb-6">
              <div className="font-mono text-[11px] tracking-[1.6px] text-[var(--text-secondary)] uppercase">
                Your details — sent with the order
              </div>
              <div className="grid gap-1">
                <label htmlFor="cart-name" className="text-[13px] text-[var(--text-secondary)]">
                  Name
                </label>
                <input
                  id="cart-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="h-[42px] border-0 border-b border-[var(--border-strong)] bg-white px-3 text-sm text-[var(--text-primary)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <label htmlFor="cart-phone" className="text-[13px] text-[var(--text-secondary)]">
                    Phone
                  </label>
                  <input
                    id="cart-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit number"
                    className="h-[42px] border-0 border-b border-[var(--border-strong)] bg-white px-3 font-mono text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div className="grid gap-1">
                  <label htmlFor="cart-city" className="text-[13px] text-[var(--text-secondary)]">
                    City &amp; pincode
                  </label>
                  <input
                    id="cart-city"
                    value={cityAndPincode}
                    onChange={(e) => setCityAndPincode(e.target.value)}
                    placeholder="Pune 411001"
                    className="h-[42px] border-0 border-b border-[var(--border-strong)] bg-white px-3 text-sm text-[var(--text-primary)]"
                  />
                </div>
              </div>
              <div className="grid gap-1">
                <label htmlFor="cart-note" className="text-[13px] text-[var(--text-secondary)]">
                  Anything we should know?
                </label>
                <input
                  id="cart-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Gift wrap, card message, delivery date"
                  className="h-[42px] border-0 border-b border-[var(--border-strong)] bg-white px-3 text-sm text-[var(--text-primary)]"
                />
              </div>
              <label className="mt-0.5 flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={giftWrap}
                  onChange={(e) => setGiftWrap(e.target.checked)}
                  className="h-4 w-4 accent-[var(--magenta-60)]"
                />
                Gift wrap and a hand-written card (free)
              </label>

              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--magenta-60)]"
                />
                <span className="leading-snug">
                  Send me occasional WhatsApp updates about new pieces and offers.
                  <span className="block text-[13px] text-[var(--text-secondary)]">
                    Optional, and separate from this order. You can reply STOP any time.
                  </span>
                </span>
              </label>

              <p className="text-[13px] leading-snug text-[var(--text-secondary)]">
                We keep your name, phone and city to handle this order and reach you about
                it. Ask us on WhatsApp any time to see or delete what we hold.
              </p>
            </div>
          )}
        </div>

        {hasItems && (
          <div className="border-t border-[var(--gray-20)] px-5 pt-4 pb-5">
            <div className="flex justify-between text-sm text-[var(--text-secondary)]">
              <span>Items</span>
              <span className="font-mono">{formatInr(subtotal)}</span>
            </div>
            <div className="mt-1.5 flex justify-between text-sm text-[var(--text-secondary)]">
              <span>Delivery</span>
              <span className="font-mono">{quote.label}</span>
            </div>

            {/* Free-delivery progress. Rendered only while an offer is
                configured, so a store with no offer shows no empty bar. */}
            {progress && (
              <div className="mt-3">
                <div
                  className="h-1.5 w-full bg-[var(--gray-20)]"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress.fraction * 100)}
                  aria-label="Progress towards free delivery"
                >
                  <div
                    className="h-full transition-[width] duration-300 ease-[var(--easing-standard)]"
                    style={{
                      width: `${progress.fraction * 100}%`,
                      background: progress.qualified
                        ? "var(--teal-60)"
                        : "var(--magenta-60)",
                    }}
                  />
                </div>
                <p
                  role="status"
                  className={`mt-1.5 text-[13px] leading-snug ${
                    progress.qualified
                      ? "text-[var(--teal-60)]"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  {progress.message}
                </p>
              </div>
            )}

            <div className="mt-3.5 flex items-baseline justify-between border-t border-[var(--gray-100)] pt-3.5">
              <span className="text-base font-semibold">
                {quote.totalProvisional ? "Total so far" : "Total"}
              </span>
              <span className="font-mono text-2xl leading-tight font-semibold">
                {formatInr(quote.total)}
              </span>
            </div>
            {quote.totalProvisional && (
              <p className="mt-1 text-[13px] leading-snug text-[var(--text-secondary)]">
                Delivery is not included — we confirm it on WhatsApp.
              </p>
            )}
            {waOrderLink ? (
              <a
                href={waOrderLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={recordOrder}
                className="mt-4 flex h-14 items-center justify-center bg-[var(--magenta-60)] text-base font-medium text-white transition-colors duration-150 hover:bg-[var(--purple-60)] hover:no-underline"
              >
                Send this order on WhatsApp
              </a>
            ) : (
              <p className="mt-4 text-sm text-[var(--text-secondary)]">
                Ordering isn&apos;t available yet — WhatsApp isn&apos;t configured.
              </p>
            )}
            <p className="mt-3 text-[13px] leading-snug text-[var(--text-secondary)]">
              No payment on the site. We reply on WhatsApp to confirm stock and the total, then
              send payment details.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
