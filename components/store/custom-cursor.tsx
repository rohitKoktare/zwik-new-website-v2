"use client";

import { useEffect, useRef } from "react";

/**
 * The design reference's custom cursor: a 34px outlined ring that lags behind
 * the pointer, plus a 6px dot that tracks it exactly. Over anything
 * interactive the ring grows and turns yellow.
 *
 * Deliberate differences from the reference implementation:
 *
 *   - It only engages for a real pointer (`hover: hover` and `pointer: fine`).
 *     On touch there is no cursor to replace, and hiding the native one on a
 *     hybrid device would strand a user who picks up a mouse — so the media
 *     query is watched, not read once.
 *   - It bails out entirely under `prefers-reduced-motion: reduce`. A ring that
 *     chases the pointer is exactly the kind of continuous motion that setting
 *     asks to be spared.
 *   - `cursor: none` is applied by setting `data-zw-cursor` on <body> only
 *     after the ring is mounted, so a failure here can never leave the page
 *     with no visible pointer at all.
 *
 * Positions are written straight to the DOM inside a rAF loop rather than held
 * in state — this repaints on every mouse move, and React state would rerender
 * the tree ~60 times a second for a purely visual effect.
 */

/** Ring lerp per frame. Lower = more lag. */
const RING_EASE = 0.16;
/** Scale lerp per frame. */
const SCALE_EASE = 0.18;
/** Ring scale over an interactive target. */
const ACTIVE_SCALE = 2.1;
/** What counts as interactive. */
const INTERACTIVE = "a, button, article, input, select, textarea, [role='button']";

export function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

    // Holds the teardown for the currently running effect, if any.
    let stop: (() => void) | null = null;

    function start() {
      const ring = ringRef.current;
      const dot = dotRef.current;
      if (!ring || !dot) return;

      let targetX = window.innerWidth / 2;
      let targetY = window.innerHeight / 2;
      let ringX = targetX;
      let ringY = targetY;
      let scale = 1;
      let targetScale = 1;
      let frame = 0;

      const onMove = (event: MouseEvent) => {
        targetX = event.clientX;
        targetY = event.clientY;
        ring.style.opacity = "1";
        dot.style.opacity = "1";

        const target = event.target;
        const overInteractive =
          target instanceof Element ? target.closest(INTERACTIVE) !== null : false;

        targetScale = overInteractive ? ACTIVE_SCALE : 1;
        ring.style.borderColor = overInteractive
          ? "var(--yellow-30)"
          : "var(--magenta-60)";
      };

      // Leaving the window should hide the ring rather than park it at the edge.
      const onLeave = () => {
        ring.style.opacity = "0";
        dot.style.opacity = "0";
      };

      const paint = () => {
        ringX += (targetX - ringX) * RING_EASE;
        ringY += (targetY - ringY) * RING_EASE;
        scale += (targetScale - scale) * SCALE_EASE;
        ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) scale(${scale.toFixed(3)})`;
        dot.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
        frame = requestAnimationFrame(paint);
      };

      window.addEventListener("mousemove", onMove, { passive: true });
      document.addEventListener("mouseleave", onLeave);
      frame = requestAnimationFrame(paint);
      document.body.dataset.zwCursor = "1";

      stop = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseleave", onLeave);
        delete document.body.dataset.zwCursor;
        ring.style.opacity = "0";
        dot.style.opacity = "0";
      };
    }

    function sync() {
      const shouldRun = pointerQuery.matches && !motionQuery.matches;

      if (shouldRun && !stop) start();
      else if (!shouldRun && stop) {
        stop();
        stop = null;
      }
    }

    sync();
    motionQuery.addEventListener("change", sync);
    pointerQuery.addEventListener("change", sync);

    return () => {
      motionQuery.removeEventListener("change", sync);
      pointerQuery.removeEventListener("change", sync);
      stop?.();
    };
  }, []);

  return (
    <>
      <div
        ref={ringRef}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-90 -mt-[17px] -ml-[17px] size-[34px] border border-[var(--magenta-60)] opacity-0 will-change-transform"
      />
      <div
        ref={dotRef}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-91 -mt-[3px] -ml-[3px] size-1.5 bg-[var(--magenta-60)] opacity-0 will-change-transform"
      />
    </>
  );
}
