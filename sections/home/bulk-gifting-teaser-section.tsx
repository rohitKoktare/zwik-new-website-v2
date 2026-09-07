import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/store/reveal";

export function BulkGiftingTeaserSection() {
  return (
    <section className="grid grid-cols-1 border-b border-[var(--gray-100)] md:grid-cols-2">
      <div className="relative min-h-[280px] overflow-hidden border-b border-[var(--gray-100)] bg-[var(--gray-10)] md:min-h-[380px] md:border-r md:border-b-0">
        <Image
          src="/products/houses-diorama.jpg"
          alt="Miniature cottage houses on a grass diorama"
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
      <Reveal className="flex flex-col justify-center p-8 md:p-12">
        <div className="font-mono text-[11px] tracking-[2px] text-[var(--teal-60)] uppercase">
          Bulk &amp; corporate
        </div>
        <h2 className="mt-3.5 text-[clamp(30px,3.4vw,48px)] leading-[0.98] font-semibold tracking-[-0.03em]">
          Twenty-five desks,
          <br />
          twenty-five worlds.
        </h2>
        <p className="mt-4.5 mb-7 max-w-[44ch] text-base leading-relaxed text-[var(--text-secondary)]">
          Onboarding kits, festival hampers, client thank-yous. We quote per piece and wrap the
          lot.
        </p>
        <div>
          <Link
            href="/bulk-gifting"
            className="flex h-13 w-fit items-center bg-[var(--teal-60)] px-7 text-[15px] font-medium text-white hover:bg-[var(--gray-100)]"
          >
            Bulk gifting →
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
