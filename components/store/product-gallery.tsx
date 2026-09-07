"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { ProductImage } from "@/types/product";

/**
 * Product gallery with the reference's cursor-tilt effect.
 *
 * **Sizing.** The reference is a fixed-width desktop mock, so a square filling
 * the 1.15fr column looked right there. On a real wide monitor that same square
 * became ~1000px tall — taller than the viewport, pushing the price and the Add
 * to cart button below the fold. The frame is therefore capped by
 * `--zw-gallery-max` and centred in its column, which keeps the 1:1 crop the
 * design depends on while bounding the height. Cap the *width* rather than use
 * `max-height`, or the square stops being square.
 *
 * **Tilt.** ±7° per axis from the pointer position, held at `scale(1.04)` so
 * the media always overfills the frame and no background shows at the corners
 * mid-tilt. Written straight to the element's style inside the pointer handler
 * rather than via state: the reference re-rendered on every mousemove, which is
 * free in a canvas runtime and wasteful here.
 *
 * Skipped entirely under `prefers-reduced-motion: reduce`, and never armed for
 * touch — a tilt that needs a hovering pointer is meaningless there.
 */

/** Total rotation range per axis, in degrees. ±7°. */
const TILT_RANGE = 14;
/** Held constant so the tilted media never reveals the frame behind it. */
const TILT_SCALE = 1.04;
/** Widest the square frame is allowed to get. */
const MAX_FRAME = "min(100%, 560px)";

export function ProductGallery({
  images,
  name,
  videoUrl,
}: {
  images: ProductImage[];
  name: string;
  /** Attached product video, shown as the first gallery item. */
  videoUrl?: string | null;
}) {
  // Index into the combined item list: the video (when present) is item 0.
  const [active, setActive] = useState(0);
  const [tiltEnabled, setTiltEnabled] = useState(false);

  const mediaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");

    const sync = () => setTiltEnabled(pointer.matches && !motion.matches);

    sync();
    motion.addEventListener("change", sync);
    pointer.addEventListener("change", sync);

    return () => {
      motion.removeEventListener("change", sync);
      pointer.removeEventListener("change", sync);
    };
  }, []);

  const items: { kind: "video" | "image"; url: string; altText: string }[] = [
    ...(videoUrl ? [{ kind: "video" as const, url: videoUrl, altText: `${name} video` }] : []),
    ...images.map((image) => ({
      kind: "image" as const,
      url: image.url,
      altText: image.altText,
    })),
  ];

  const current = items[active] ?? items[0];

  function resetTilt() {
    const media = mediaRef.current;
    if (media) media.style.transform = "";
  }

  function handleTilt(event: React.MouseEvent<HTMLDivElement>) {
    const media = mediaRef.current;
    if (!media || !tiltEnabled) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const rotateY = ((event.clientX - rect.left) / rect.width - 0.5) * TILT_RANGE;
    const rotateX = -((event.clientY - rect.top) / rect.height - 0.5) * TILT_RANGE;

    media.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${TILT_SCALE})`;
  }

  // Switching item mid-tilt would otherwise leave the new media rotated.
  function pick(index: number) {
    setActive(index);
    resetTilt();
  }

  if (!current) return null;

  return (
    <div className="min-w-0 border-[var(--gray-20)] md:border-r">
      <div
        className="mx-auto w-full px-6 py-6 md:px-8"
        style={{ maxWidth: `calc(${MAX_FRAME} + 4rem)` }}
      >
        <div
          onMouseMove={handleTilt}
          onMouseLeave={resetTilt}
          className="relative mx-auto aspect-square w-full overflow-hidden bg-[var(--gray-10)]"
          style={{ maxWidth: MAX_FRAME, perspective: "1000px" }}
        >
          <div
            ref={mediaRef}
            className="relative size-full transition-transform duration-[110ms] ease-[var(--easing-standard)]"
          >
            {current.kind === "video" ? (
              <video
                // Keyed so switching between two videos remounts the element
                // rather than reusing a player still holding the old source.
                key={current.url}
                src={current.url}
                muted
                loop
                autoPlay
                playsInline
                // No `controls`: the tilt frame owns the pointer, and a control
                // bar would fight it. Autoplay is muted, which is the only form
                // browsers allow without a gesture.
                aria-label={current.altText}
                className="size-full object-cover"
              />
            ) : (
              <Image
                src={current.url}
                alt={current.altText}
                fill
                sizes="(min-width: 768px) 560px, 100vw"
                priority
                className="object-cover"
              />
            )}
          </div>

          {tiltEnabled && current.kind === "image" && (
            <div className="pointer-events-none absolute right-3 bottom-3 bg-[rgba(22,22,22,0.72)] px-2.5 py-1.5 font-mono text-[10px] tracking-[1.4px] text-white uppercase">
              Move your cursor to tilt
            </div>
          )}
        </div>

        {items.length > 1 && (
          <div className="mx-auto mt-px flex gap-px overflow-x-auto bg-[var(--gray-20)]">
            {items.map((item, i) => (
              <button
                key={`${item.kind}-${item.url}`}
                type="button"
                onClick={() => pick(i)}
                aria-label={
                  item.kind === "video"
                    ? `Show ${name} video`
                    : `Show ${name} photo ${videoUrl ? i : i + 1}`
                }
                aria-pressed={i === active}
                className="relative size-20 flex-none border-b-[3px] bg-white transition-opacity hover:opacity-80"
                style={{ borderBottomColor: i === active ? "var(--magenta-60)" : "#ffffff" }}
              >
                {item.kind === "video" ? (
                  <span className="flex size-full items-center justify-center bg-[var(--gray-100)] font-mono text-[10px] tracking-[1.2px] text-white uppercase">
                    <span aria-hidden>▶ Video</span>
                  </span>
                ) : (
                  <Image src={item.url} alt="" fill sizes="80px" className="object-cover" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
