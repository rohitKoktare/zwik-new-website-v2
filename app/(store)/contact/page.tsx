import type { Metadata } from "next";
import { Reveal } from "@/components/store/reveal";
import { getSiteSettings } from "@/lib/supabase/queries/settings";
import { buildWaLink } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with ZWIK on WhatsApp or email.",
};

export default async function ContactPage() {
  const settings = await getSiteSettings();
  const waLink =
    settings.whatsappEnabled && settings.whatsappNumber
      ? buildWaLink(
          settings.whatsappNumber,
          settings.whatsappDefaultMessage ??
            "Hi ZWIK! I saw your site and wanted to ask about a piece.",
        )
      : null;

  return (
    <section className="px-6 py-16 md:px-12">
      <Reveal>
        <h1 className="text-[44px] leading-[1.02] font-semibold tracking-[-0.035em]">
          Get in touch
        </h1>
        <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-[var(--text-secondary)]">
          No forms, no accounts — the fastest way to reach us is WhatsApp. We reply during
          business hours, India time.
        </p>
      </Reveal>
      <Reveal delayMs={120} className="mt-8 flex flex-col gap-4 sm:flex-row">
        {waLink ? (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-[54px] items-center bg-[var(--magenta-60)] px-7.5 text-[15px] font-medium text-white hover:bg-[var(--purple-60)]"
          >
            Message us on WhatsApp
          </a>
        ) : (
          <p className="text-[var(--text-secondary)]">
            WhatsApp isn&apos;t configured yet — add a number in Settings.
          </p>
        )}
        {settings.contactEmail && (
          <a
            href={`mailto:${settings.contactEmail}`}
            className="flex h-[54px] items-center border border-[var(--gray-100)] px-7.5 text-[15px] font-medium text-[var(--gray-100)] hover:bg-[var(--gray-100)] hover:text-white"
          >
            {settings.contactEmail}
          </a>
        )}
      </Reveal>
    </section>
  );
}
