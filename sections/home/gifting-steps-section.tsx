import { Reveal } from "@/components/store/reveal";
const STEPS = [
  {
    n: "01",
    title: "Fill your cart",
    body: "Add as many pieces as you like. Nothing is charged here.",
  },
  {
    n: "02",
    title: "Send it on WhatsApp",
    body: "One tap sends the full list, your details, and the total to us.",
  },
  {
    n: "03",
    title: "We confirm and share payment",
    body: "We check stock, confirm the total, and send payment details. Then it ships.",
  },
];

export function GiftingStepsSection({ waGiftLink }: { waGiftLink: string | null }) {
  return (
    <section className="grid grid-cols-1 border-t border-[var(--gray-100)] bg-[var(--gray-100)] text-white md:grid-cols-2">
      {/*
        This column carries the headline, and it is what a reader actually
        looks at. It previously had no reveal of its own — the whole section
        was wrapped instead, which fired at 9% visible and finished before the
        heading was on screen.
      */}
      <Reveal className="p-8 md:p-16">
        <div className="font-mono text-[11px] tracking-[2px] text-[var(--yellow-30)] uppercase">
          Gifting
        </div>
        <h2 className="mt-4 text-[clamp(34px,4vw,58px)] leading-[0.94] font-semibold tracking-[-0.035em]">
          Small enough to
          <br />
          post. Big enough
          <br />
          to mean something.
        </h2>
        <p className="mt-5.5 mb-8 max-w-[46ch] text-base leading-relaxed text-[var(--gray-30)]">
          Every ZWIK piece leaves us boxed and wrapped, with a card if you want one. Tell us the
          occasion and we&apos;ll pick the pairing.
        </p>
        {waGiftLink && (
          <a
            href={waGiftLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-[54px] items-center bg-[var(--yellow-30)] px-7.5 text-[15px] font-medium text-[var(--gray-100)] hover:bg-white"
          >
            Ask for a gift pick
          </a>
        )}
      </Reveal>
      <div className="grid border-l-0 border-[var(--gray-90)] md:grid-rows-3 md:border-l">
        {/* Staggered 60/180/300ms, as in the design reference — the steps read as
            a sequence, so they should arrive as one. */}
        {STEPS.map((step, i) => (
          <Reveal
            key={step.n}
            delayMs={60 + i * 120}
            className="flex items-center gap-5.5 border-b border-[var(--gray-90)] px-6 py-6 last:border-b-0 md:px-10"
          >
            <span className="font-mono text-[13px] text-[var(--magenta-60)]">{step.n}</span>
            <div>
              <div className="text-[19px] leading-tight font-semibold">{step.title}</div>
              <div className="mt-1 text-sm text-[var(--gray-30)]">{step.body}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
