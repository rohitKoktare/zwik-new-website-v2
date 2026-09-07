import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/store/reveal";
import { getSiteSettings } from "@/lib/supabase/queries/settings";
import { buildWaLink } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Bulk gifting",
  description: "Onboarding kits, festival hampers, and client thank-yous — quoted per piece.",
};

const CORP_ROWS = [
  { label: "Minimum order", value: "25 pieces, mixed pieces are fine" },
  { label: "Lead time", value: "7–10 working days after the design is locked" },
  { label: "Branding", value: "Printed card or sleeve with your logo" },
  { label: "Pricing", value: "Per-piece, quoted on the mix and quantity" },
];

export default async function BulkGiftingPage() {
  const settings = await getSiteSettings();
  const waLink =
    settings.whatsappEnabled && settings.whatsappNumber
      ? buildWaLink(
          settings.whatsappNumber,
          "Hi ZWIK! I am asking about bulk gifting. Headcount and occasion:",
        )
      : null;

  return (
    <section className="grid grid-cols-1 border-b border-[var(--gray-100)] md:grid-cols-[1fr_0.9fr]">
      <div className="border-b border-[var(--gray-100)] px-6 py-12 md:border-r md:border-b-0 md:px-12 md:py-17">
        <Reveal>
          <div className="inline-block bg-[var(--teal-60)] px-2.5 py-1.5 font-mono text-[11px] tracking-[2px] text-white uppercase">
            Bulk &amp; corporate gifting
          </div>
        <h1 className="mt-6.5 text-[clamp(40px,5.2vw,78px)] leading-[0.89] font-semibold tracking-[-0.045em]">
          Gifts that land
          <br />
          on the desk,
          <br />
          not in a drawer.
        </h1>
        <p className="mt-6.5 max-w-[50ch] text-[17px] leading-relaxed text-[var(--text-secondary)]">
          Onboarding kits, festival hampers, client thank-yous, event giveaways. Send us the
          headcount and the occasion; we&apos;ll come back with a pairing and a per-piece price.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-[54px] items-center bg-[var(--teal-60)] px-7.5 text-[15px] font-medium text-white hover:bg-[var(--gray-100)]"
            >
              Get a quote on WhatsApp
            </a>
          )}
          <Link
            href="/products"
            className="flex h-[54px] items-center border border-[var(--gray-100)] px-7.5 text-[15px] font-medium text-[var(--gray-100)] hover:bg-[var(--gray-100)] hover:text-white"
          >
            Browse the catalog
          </Link>
          </div>
        </Reveal>
        <div className="mt-10 grid gap-px border border-[var(--gray-20)] bg-[var(--gray-20)]">
          {CORP_ROWS.map((row, i) => (
            <Reveal
              key={row.label}
              delayMs={i * 70}
              className="grid grid-cols-[1fr_1.4fr] gap-4 bg-white px-4.5 py-4 transition-colors hover:bg-[var(--layer-hover-01)]"
            >
              <span className="font-mono text-[13px] tracking-[1.2px] uppercase">{row.label}</span>
              <span className="text-[15px] text-[var(--text-secondary)]">{row.value}</span>
            </Reveal>
          ))}
        </div>
        <p className="mt-4.5 font-mono text-[11px] tracking-[1.2px] text-[var(--text-helper)] uppercase">
          Illustrative terms — confirm current pricing and lead times before quoting a client
        </p>
      </div>
      <div className="grid grid-rows-2">
        <div className="relative border-b border-[var(--gray-100)] bg-[var(--gray-10)]">
          <Image
            src="/products/cat-set-white.jpg"
            alt="Cat dashboard decor set"
            fill
            sizes="(min-width: 768px) 38vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="relative bg-[var(--gray-10)]">
          <Image
            src="/products/houses-dimensions.jpg"
            alt="Cottage house set with dimensions"
            fill
            sizes="(min-width: 768px) 38vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
