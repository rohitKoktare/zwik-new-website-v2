"use client";

import { useEffect, useRef } from "react";
import { armReveal } from "@/lib/store/arm-reveal";

/**
 * Scroll-reveal wrapper: fades and lifts its children into place the first time
 * they enter the viewport, matching the reference's `data-reveal` behaviour.
 *
 * The mechanism lives in `lib/store/arm-reveal.ts` so it can be tested without a
 * browser; this is only the React binding.
 *
 * `[data-reveal]` on its own styles nothing. The hidden state is keyed off
 * `data-reveal-armed`, which only the client sets — so if the bundle fails to
 * load, the content is simply visible. A reveal animation must never be able to
 * blank a page.
 */
export function Reveal({
  children,
  delayMs = 0,
  className,
}: {
  children: React.ReactNode;
  /** Stagger for a row of siblings, in milliseconds. */
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    return armReveal(element, {
      motionReduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  }, []);

  return (
    <div
      ref={ref}
      data-reveal=""
      className={className}
      style={
        delayMs ? ({ "--zw-reveal-delay": `${delayMs}ms` } as React.CSSProperties) : undefined
      }
    >
      {children}
    </div>
  );
}
