"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatInr } from "@/lib/format";

/**
 * Shown once an order has actually been placed on the site.
 *
 * This exists because the old flow gave the customer no confirmation at all:
 * the CTA was an anchor straight to `wa.me`, so after clicking it the drawer sat
 * unchanged with the cart still full, and the only feedback was a new browser
 * tab. On a laptop that tab is `web.whatsapp.com`, which shows a QR code to
 * anyone not already signed in there — mid-checkout.
 *
 * Two consequences worth knowing:
 *
 *  - **WhatsApp is now a second click, inside this dialog.** That is what makes
 *    awaiting the capture safe: the open happens on its own fresh user gesture,
 *    so a popup blocker has no reason to eat it. Awaiting was previously
 *    impossible for exactly that reason.
 *  - **"Copy order summary" is the laptop fix.** It needs no WhatsApp session
 *    and no user-agent sniffing — the customer can paste the order into
 *    whatever they already have open.
 *
 * It must not imply the order is confirmed, reserved or paid: ZWIK agrees stock
 * and the total on WhatsApp (ARCHITECTURE.md §18). Hence "Order received", not
 * "Order confirmed".
 */
export function OrderPlacedDialog({
  open,
  onClose,
  orderNumber,
  trackingPath,
  total,
  totalProvisional,
  waLink,
  orderSummary,
}: {
  open: boolean;
  onClose: () => void;
  /** Null when the capture failed — the order still reaches ZWIK via WhatsApp. */
  orderNumber: string | null;
  /** Site-relative, e.g. `/orders/<token>`. Null when the capture failed. */
  trackingPath: string | null;
  total: number;
  /** True when delivery was not quoted, so the figure excludes it. */
  totalProvisional: boolean;
  /** Null when WhatsApp is switched off in settings. */
  waLink: string | null;
  /** The same text the WhatsApp message carries, for the clipboard fallback. */
  orderSummary: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(orderSummary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard can be blocked by permissions or a non-secure context. Saying
      // nothing is better than an error the customer cannot act on — the
      // WhatsApp link and the tracking link both still work.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="gap-0 border-0 bg-white p-0 sm:max-w-md"
      >
        <div className="flex items-center gap-3 bg-[var(--gray-100)] px-5 py-4 text-white">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center bg-[var(--teal-60)]"
          >
            <CheckIcon className="size-4" />
          </span>
          <DialogTitle className="font-mono text-[13px] font-semibold tracking-[1.6px] text-white uppercase">
            Order received
          </DialogTitle>
        </div>

        <div className="grid gap-4 px-5 py-5">
          {orderNumber ? (
            <div>
              <div className="font-mono text-[11px] tracking-[1.4px] text-[var(--text-secondary)] uppercase">
                Your order number
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold tracking-tight">
                {orderNumber}
              </div>
            </div>
          ) : (
            /*
             * The capture failed but the sale must not. No number to show, so
             * the message itself becomes the record — say so plainly rather
             * than inventing a reference.
             */
            <p role="alert" className="text-sm leading-relaxed">
              We couldn&rsquo;t save an order reference just now. Send the details on
              WhatsApp and we&rsquo;ll pick it up from there.
            </p>
          )}

          <div className="flex items-baseline justify-between border-y border-[var(--gray-20)] py-3">
            <span className="text-sm text-[var(--text-secondary)]">
              {totalProvisional ? "Total so far" : "Total"}
            </span>
            <span className="font-mono text-lg font-semibold">{formatInr(total)}</span>
          </div>

          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            Nothing is charged yet. Send us the details on WhatsApp and we&rsquo;ll confirm
            what&rsquo;s in stock, the final total including delivery, and how to pay.
          </p>

          <div className="grid gap-2">
            {waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-13 items-center justify-center bg-[var(--magenta-60)] text-base font-medium text-white transition-colors duration-150 hover:bg-[var(--purple-60)] hover:no-underline"
              >
                Send details on WhatsApp
              </a>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                WhatsApp isn&rsquo;t set up right now — copy your order below and email or
                call us instead.
              </p>
            )}

            <button
              type="button"
              onClick={copySummary}
              className="flex h-11 items-center justify-center gap-2 border border-[var(--gray-100)] text-sm font-medium text-[var(--gray-100)] transition-colors duration-150 hover:bg-[var(--gray-100)] hover:text-white"
            >
              {copied ? (
                <>
                  <CheckIcon className="size-4" aria-hidden />
                  Copied
                </>
              ) : (
                <>
                  <CopyIcon className="size-4" aria-hidden />
                  Copy order summary
                </>
              )}
            </button>
          </div>

          {trackingPath && (
            <p className="text-[13px] leading-snug text-[var(--text-secondary)]">
              Check this order any time at{" "}
              <Link href={trackingPath} className="underline">
                its tracking page
              </Link>
              . The link is also in the WhatsApp message, so it stays in your chat.
            </p>
          )}

          <button
            type="button"
            onClick={onClose}
            className="justify-self-start text-sm text-[var(--text-secondary)] underline"
          >
            Keep browsing
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
