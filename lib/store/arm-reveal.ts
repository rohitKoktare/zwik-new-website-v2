/**
 * The scroll-reveal mechanism, extracted from the React component so it can be
 * tested without a browser.
 *
 * `components/store/reveal.tsx` is a thin wrapper around this. Keeping the
 * logic here means the behaviour that actually matters — does an element get
 * armed, does it get released, and can it ever get stuck invisible — is
 * verifiable, which it is not when it lives inside a `useEffect`.
 */

export type ArmRevealOptions = {
  /** Skip everything and leave the element visible. */
  motionReduced: boolean;
  /** Milliseconds before the failsafe releases anything still hidden. */
  failsafeMs?: number;
};

/**
 * How long before the failsafe releases anything still hidden.
 *
 * The reference used 2600ms and released *everything* unconditionally. Measured
 * in a real browser, that is what made the effect invisible: a visitor who reads
 * the hero for three seconds before scrolling has had every reveal on the page
 * fire while it was still far below the fold. By the time they arrive, the
 * animation is long over.
 *
 * So the timer is both longer and, more importantly, position-aware — see
 * `releaseIfReachable`. It is now a genuine last resort rather than a blanket.
 */
export const DEFAULT_FAILSAFE_MS = 8000;

/**
 * Reveal when the element's top edge has risen into the upper 75% of the
 * viewport, i.e. it has genuinely arrived rather than merely grazed the bottom.
 *
 * `threshold` is deliberately 0 and the trigger is expressed entirely through
 * `rootMargin`. A fractional threshold is the wrong tool here: it measures a
 * proportion of the *element*, so the taller the element the sooner it fires.
 * At the previous 0.08, a 510px block fired with 9% of it showing and a
 * full-height section fired the instant its top edge appeared. A bottom margin
 * is measured against the viewport instead, so it behaves the same whatever the
 * element's height.
 */
const ROOT_MARGIN = "0px 0px -25% 0px";
const THRESHOLD = 0;

/**
 * Arms one element and returns its cleanup.
 *
 * Three release paths, deliberately overlapping. A reveal animation that leaves
 * content permanently invisible is far worse than one that fires early, so
 * "stuck hidden" is guarded three ways:
 *
 *  1. **Already on screen at mount** — released on the next frame, so
 *     above-the-fold content is never blank waiting for a scroll that will
 *     never come.
 *  2. **IntersectionObserver** — the normal path.
 *  3. **A scroll sweep and a timeout** — the reference carried both. The sweep
 *     covers a browser where the observer misbehaves; the timeout covers an
 *     element that never intersects at all (inside an overflow container, or a
 *     viewport shorter than the element's offset).
 *
 * Returns a no-op cleanup when motion is reduced, having touched nothing — the
 * element then renders in its final position with no transition.
 */
export function armReveal(element: HTMLElement, options: ArmRevealOptions): () => void {
  if (options.motionReduced) return () => {};

  const show = () => {
    element.dataset.revealed = "1";
  };

  // The hidden state is only applied once we know the client is running. If
  // this function never executes, `[data-reveal]` alone styles nothing and the
  // content is simply visible.
  element.dataset.revealArmed = "1";

  /**
   * Has the element's top edge risen into the upper 75% of the viewport?
   *
   * The same trigger the observer's `rootMargin` expresses, in plain arithmetic,
   * so the scroll fallback releases at exactly the point the observer would.
   * Two paths that disagree would make the animation fire at different moments
   * depending on which won the race.
   */
  const hasArrived = () => {
    const rect = element.getBoundingClientRect();
    return rect.top < window.innerHeight * 0.75 && rect.bottom > 0;
  };

  /** Is any part of it at or above the fold — could the visitor be looking at it? */
  const isReachable = () => element.getBoundingClientRect().top < window.innerHeight;

  if (hasArrived()) {
    // One frame armed, so the transition has a start value to run from.
    const frame = requestAnimationFrame(show);
    return () => cancelAnimationFrame(frame);
  }

  const cleanups: (() => void)[] = [];

  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show();
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: ROOT_MARGIN, threshold: THRESHOLD },
    );

    observer.observe(element);
    cleanups.push(() => observer.disconnect());
  }

  // Scroll sweep, as in the reference. Cheap: one rect read per scroll event,
  // and it removes itself the moment the element is released.
  const sweep = () => {
    if (element.dataset.revealed === "1") {
      window.removeEventListener("scroll", sweep);
      return;
    }
    if (hasArrived()) {
      show();
      window.removeEventListener("scroll", sweep);
    }
  };

  window.addEventListener("scroll", sweep, { passive: true });
  cleanups.push(() => window.removeEventListener("scroll", sweep));

  /**
   * Last resort, and deliberately position-aware.
   *
   * It only releases an element the visitor could actually be looking at. If the
   * element is still below the fold it waits another interval instead — firing
   * there would animate something nobody can see, which is exactly the bug this
   * replaced. Nothing can stay stuck, because the check repeats until it either
   * releases or is cleaned up.
   */
  const failsafeMs = options.failsafeMs ?? DEFAULT_FAILSAFE_MS;
  let failsafe = 0;

  const releaseIfReachable = () => {
    if (element.dataset.revealed === "1") return;
    if (isReachable()) {
      show();
      return;
    }
    failsafe = window.setTimeout(releaseIfReachable, failsafeMs);
  };

  failsafe = window.setTimeout(releaseIfReachable, failsafeMs);
  cleanups.push(() => window.clearTimeout(failsafe));

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
