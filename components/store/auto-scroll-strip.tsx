"use client";

import { useEffect, useRef } from "react";

/**
 * Horizontally auto-scrolling row, as in the reference's catalog strip: it
 * creeps sideways at ~24px/s, pauses while the pointer is over it, and wraps
 * back to the start on reaching the end.
 *
 * Notes on the details that matter:
 *   - Scroll position is accumulated as a float and applied in whole pixels.
 *     `scrollLeft` is integral, so adding 0.4 each frame would round to zero
 *     every time and the strip would never move.
 *   - Speed is derived from elapsed time, not frames, so it looks the same on a
 *     120Hz display as on a 60Hz one and does not sprint after a background tab
 *     is refocused (the delta is clamped).
 *   - It stops entirely if the content fits, if the pointer is over it, if the
 *     user has scrolled it themselves with a keyboard focus inside, or under
 *     `prefers-reduced-motion: reduce` — auto-moving content is precisely what
 *     that setting is for.
 */

/** Pixels per second. */
const SPEED = 24;
/** Longest frame delta honoured, so a backgrounded tab cannot jump the strip. */
const MAX_DELTA_MS = 400;

export function AutoScrollStrip({
  children,
  className,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let frame = 0;
    let last = 0;
    let carry = 0;
    let paused = false;
    let running = false;

    const step = (now: number) => {
      if (last === 0) last = now;
      const delta = Math.min(now - last, MAX_DELTA_MS);
      last = now;

      const overflows = element.scrollWidth > element.clientWidth + 4;

      if (!paused && overflows) {
        carry += (delta / 1000) * SPEED;
        const whole = Math.floor(carry);

        if (whole >= 1) {
          carry -= whole;
          // At the end, jump back rather than reversing — the reference loops.
          if (element.scrollLeft + element.clientWidth >= element.scrollWidth - 1) {
            element.scrollLeft = 0;
          } else {
            element.scrollLeft += whole;
          }
        }
      }

      frame = requestAnimationFrame(step);
    };

    const pause = () => {
      paused = true;
    };
    const resume = () => {
      paused = false;
    };

    const start = () => {
      if (running) return;
      running = true;
      last = 0;
      element.addEventListener("mouseenter", pause);
      element.addEventListener("mouseleave", resume);
      // Keyboard users tabbing through the cards must not have the row slide
      // out from under the focused element.
      element.addEventListener("focusin", pause);
      element.addEventListener("focusout", resume);
      // A deliberate touch drag also stops it.
      element.addEventListener("touchstart", pause, { passive: true });
      frame = requestAnimationFrame(step);
    };

    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
      element.removeEventListener("mouseenter", pause);
      element.removeEventListener("mouseleave", resume);
      element.removeEventListener("focusin", pause);
      element.removeEventListener("focusout", resume);
      element.removeEventListener("touchstart", pause);
    };

    const sync = () => {
      if (motion.matches) stop();
      else start();
    };

    sync();
    motion.addEventListener("change", sync);

    return () => {
      motion.removeEventListener("change", sync);
      stop();
    };
  }, []);

  return (
    <div ref={ref} className={className} aria-label={ariaLabel}>
      {children}
    </div>
  );
}
