import type { Metadata } from "next";
import Image from "next/image";
import { Reveal } from "@/components/store/reveal";

export const metadata: Metadata = {
  title: "About",
  description: "ZWIK makes small, hand-painted decor for crowded desks.",
};

const VALUES = [
  {
    title: "Small on purpose",
    color: "var(--magenta-60)",
    body: "Every piece is between 3 and 5 cm. It should fit in a gap you already have, not ask for a new shelf.",
  },
  {
    title: "Made to be gifted",
    color: "var(--teal-60)",
    body: "Wrapping is not an upsell. Everything ships boxed, padded, and ready to hand over.",
  },
  {
    title: "One message away",
    color: "var(--cyan-60)",
    body: "No forms, no accounts. Tell us what you're after on WhatsApp and we'll take it from there.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="grid grid-cols-1 border-b border-[var(--gray-100)] md:grid-cols-[1fr_0.85fr]">
        <Reveal className="border-b border-[var(--gray-100)] px-6 py-12 md:border-r md:border-b-0 md:px-12 md:py-17">
          <div className="inline-block bg-[var(--magenta-60)] px-2.5 py-1.5 font-mono text-[11px] tracking-[2px] text-white uppercase">
            About ZWIK
          </div>
          <h1 className="mt-6.5 text-[clamp(40px,5.4vw,82px)] leading-[0.88] font-semibold tracking-[-0.045em]">
            We make small
            <br />
            things for
            <br />
            crowded desks.
          </h1>
          <div className="mt-8 grid max-w-[58ch] gap-5 text-[17px] leading-relaxed text-[var(--text-secondary)]">
            <p className="m-0">
              ZWIK started with one idea: the places we spend the most time in are usually the
              ones we decorate the least. A desk, a monitor edge, a car dashboard. All flat, all
              functional, all a little grey.
            </p>
            <p className="m-0">
              So we collect and hand-finish miniatures small enough to live in those gaps. A cat
              in a straw hat that watches you work. A row of cottages on a shelf. A daisy on a
              spring that nods every time you close the car door.
            </p>
            <p className="m-0">Nothing here is precious. Pick one up, move it, hand it to someone else. That&apos;s the point.</p>
          </div>
        </Reveal>
        <div className="relative min-h-[300px] overflow-hidden bg-[var(--gray-10)] md:min-h-[460px]">
          <Image
            src="/products/cat-set-flatlay.jpg"
            alt="Straw hat cat set laid out on a desk"
            fill
            sizes="(min-width: 768px) 42vw, 100vw"
            className="object-cover"
          />
        </div>
      </section>
      <section className="grid grid-cols-1 md:grid-cols-3">
        {VALUES.map((value, i) => (
          <Reveal
            key={value.title}
            delayMs={i * 110}
            className={`px-8 py-11 ${i < VALUES.length - 1 ? "md:border-r md:border-[var(--gray-20)]" : ""}`}
          >
            <div
              className="font-mono text-xs tracking-[1.6px] uppercase"
              style={{ color: value.color }}
            >
              {value.title}
            </div>
            <p className="mt-3 text-base leading-relaxed text-[var(--text-secondary)]">
              {value.body}
            </p>
          </Reveal>
        ))}
      </section>
    </>
  );
}
