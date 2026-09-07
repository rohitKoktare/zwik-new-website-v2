# Frontend reference notes

Source of truth for the intended visual design is the bundled design-canvas
export at:

`../PITLANE Miniature Decor Store/ZWIK Miniature Decor (1).html`

That file is a *bundler* wrapper: the real markup is a JSON string in the
`<script type="__bundler/template">` block (last long line). To read it:

```bash
python -c "import json; s=open('ZWIK Miniature Decor (1).html',encoding='utf-8',errors='replace').read().split(chr(10)); open('page.html','w',encoding='utf-8').write(json.loads(s[388]))"
```

Template syntax in that file is design-canvas specific — `sc-if`, `sc-for`,
`sc-camel-on-*`, `{{ }}` bindings, `style-hover`. Translate to React/Tailwind;
do not copy it literally.

---

## Status

| Item | State |
| --- | --- |
| Footer (five bands) | **Done** — `components/store/site-footer.tsx` |
| Product gallery cursor tilt | **Done** — `components/store/product-gallery.tsx` |
| Product gallery sizing | **Done** — capped at 560px, see §5 |
| Custom cursor (ring + dot) | **Done** — `components/store/custom-cursor.tsx` |
| Scroll reveal | **Done** — `lib/store/arm-reveal.ts` + `components/store/reveal.tsx` |
| Marquee ticker | **Done** — `components/store/announcement-ticker.tsx` |
| Hero drift + word rotation | **Done** — `sections/home/hero-section.tsx` |
| Card hover (scale, wash, border) | **Done** — `components/store/product-card.tsx` |
| Catalog strip auto-scroll | **Done** — `components/store/auto-scroll-strip.tsx` |
| Route loaders | **Done** — `loading.tsx` per route |
| Category accent colours | **Open** — see §4 |

Sections 1–2 below are kept as the *spec* the implementation was built to, so a
future change can be checked against the reference without decoding it again.

---

## 1. Full footer — `components/store/site-footer.tsx`

The reference footer has **five** stacked bands.
Reference lines 2149–2204 of the decoded template.

**Band 1 — magenta WhatsApp CTA**
- `background: var(--magenta-60)`, white text, `padding: 44px 48px`
- grid `1.35fr auto`, `gap: 32px`, `align-items: center`
- Eyebrow: mono, 11px, `letter-spacing: 2px`, uppercase, `opacity: .85` —
  "No forms, no accounts"
- Headline: `clamp(28px, 3.2vw, 46px)`, `line-height: .98`, weight 600,
  `letter-spacing: -0.035em` — "Message us and we'll<br>pick something for you."
- Button: white bg, `color: var(--magenta-60)`, height 62px, `padding: 0 34px`,
  mono 13px/600, `letter-spacing: 1.6px`, uppercase.
  Content: `WhatsApp · {phoneLabel} · →`
  Hover: `background: var(--yellow-30); color: var(--gray-100)`
- Href comes from the existing `waLink` prop. When `waLink` is null the band
  must link to `/contact` instead of rendering a dead link
  (ARCHITECTURE.md §18 — degrade honestly).

**Band 2 — four link columns**
- grid `1.5fr 1fr 1fr 1fr`, `gap: 1px`, wrapper `background: var(--gray-90)`
  so the gap reads as hairline rules; each cell `background: var(--gray-100)`
- Cell 1: ZWIK wordmark (12px magenta square + mono 17px/600, `letter-spacing: 3px`),
  blurb at `max-width: 34ch`, 14px/1.6, then a 4-swatch color bar —
  30×8px blocks in `--magenta-60`, `--blue-60`, `--teal-60`, `--yellow-30`
- Cell 2 "Browse": Catalog, Your cart, Bulk gifting, About. Hover `--yellow-30`
- Cell 3 "Shop by spot": one row per category, each prefixed by an 8×8px swatch
  of that category's accent color. Drive from `getActiveCategories()` +
  `lib/store/category-accent.ts` — do not hard-code. Hover `#ffffff`
- Cell 4 "Good to know": Ships across India / Free gift wrap and card /
  Free delivery over ₹999 / Payment confirmed on WhatsApp
- Column headers: white, mono 11px, `letter-spacing: 1.6px`, uppercase
- Cell padding: `40px 48px 36px` (cell 1), `40px 28px 36px` (cells 2–4)

**Band 3 — oversized ZWIK watermark**
- `overflow: hidden`, `padding: 0 48px`, `border-top: 1px solid var(--gray-90)`
- Text "ZWIK": `clamp(72px, 15.5vw, 240px)`, `line-height: .82`, weight 600,
  `letter-spacing: -0.06em`, white at `opacity: .09`, `white-space: nowrap`,
  `user-select: none`, `margin-bottom: -0.16em` (deliberate bleed/crop)
- Decorative — mark `aria-hidden`.

**Band 4 — legal bar**
- flex, space-between, wrap, `gap: 16px`, `padding: 18px 48px 24px`,
  `border-top: 1px solid var(--gray-90)`
- mono 11px, `letter-spacing: 1.4px`, uppercase, `color: var(--gray-50)`
- Left: `© {year} ZWIK · Your own miniature world` — compute `year` server-side
- Right: "Made in India"

Notes
- Reference is desktop-only (fixed 48px gutters, 4-col grids). Add responsive
  collapse: stack band 1, and take band 2 to 2-col then 1-col.
- Category swatch colors must come from the DB-driven category list, so a new
  category added in admin appears in the footer automatically.

## 2. 3D cursor tilt on the product gallery

Applies to the main image on `/products/[slug]`
(`components/store/product-gallery.tsx`). Reference lines 2024–2025 and the
handlers at 2646–2654.

Container (the square frame):
```
position: relative; aspect-ratio: 1/1; overflow: hidden; perspective: 1000px;
```
Inner image wrapper:
```
transform: perspective(1000px) rotateX(<tiltY>deg) rotateY(<tiltX>deg) scale(1.04);
transition: transform 110ms <easing>;
```
Handler maths, exactly as in the reference:
```js
const r = e.currentTarget.getBoundingClientRect();
tiltX =  ((e.clientX - r.left) / r.width  - 0.5) * 14;   // deg, drives rotateY
tiltY = -((e.clientY - r.top)  / r.height - 0.5) * 14;   // deg, drives rotateX
```
- `onMouseLeave` resets both to 0.
- Range is ±7° per axis; `scale(1.04)` is held constant so the image always
  overfills the frame and no background shows at the corners on tilt.
- Reset tilt to 0 when the active thumbnail changes.
- Reference shows a hint chip bottom-right: `rgba(22,22,22,.72)` bg, white,
  mono 10px, `letter-spacing: 1.4px`, uppercase, `padding: 6px 10px`,
  `pointer-events: none` — "Move your cursor to tilt".

Implementation notes
- `product-gallery.tsx` is already a client component; this replaces its
  current `hover:scale-105`.
- Write the transform via a ref/`style` rather than React state per mousemove —
  the reference re-renders on every move, which is fine in the canvas runtime
  but wasteful here.
- Listener must be `{ passive: true }`.
- Honour `prefers-reduced-motion: reduce` — skip the tilt entirely.
- `--easing-standard` does **not** exist in `app/globals.css`. Either add the
  Carbon standard easing token (`cubic-bezier(0.2, 0, 0.38, 0.9)`) or inline it.
  Do not ship a `var()` that resolves to nothing.

## 3. Also present in the reference, not yet built

Noted for completeness — not requested yet.
- Catalog strip hover-hold (`stripHold` / `stripFree`, template line 1936).
- Product video support on the PDP — the reference tracks `hasVideo`. Schema
  and admin upload already allow video; the storefront does not render it.
  See the data-layer note in `docs/ARCHITECTURE.md` §12 and the `role` filter
  in `lib/supabase/queries/products.ts`.

## 4. Category accent colours are hard-coded by slug

`lib/store/category-accent.ts` maps four slugs (`desk`, `monitor`, `dashboard`,
`shelf`) to brand colours, and falls back to plain `--gray-100` for anything
else. Now that `/admin/categories` can create categories, an admin can add one
that renders grey on product cards — and would render grey in the footer's
"Shop by spot" column (§1) too.

The admin form and list both say so explicitly rather than failing silently, so
nothing is broken; it just needs a code change to add a colour.

Options, in rough order of preference:

1. **Add `accent_color` to `categories`** (migration + form field, constrained
   to the brand palette). Makes it fully admin-manageable and removes the
   slug coupling entirely. This is the real fix.
2. Deterministically assign one of the four brand colours to unknown slugs
   (hash the slug into the palette). No migration, but the colour changes if
   the slug is ever renamed, and two categories can collide.
3. Leave as-is and extend the map by hand when a category is added.

Note that option 1 changes what the footer and product cards read from, so it
is worth deciding before building the footer in §1 rather than after.

## 5. Reference details deliberately NOT copied

Recorded so they are not mistaken for oversights.

- **Gallery size.** The reference's PDP image is a square filling a `1.15fr`
  column of a fixed 1440px mock. Reproduced literally on a wide monitor that
  became a ~1000px-tall image, pushing the price and Add to cart below the fold.
  The frame is capped at 560px and centred instead. The 1:1 crop the design
  depends on is preserved — cap the *width*, never `max-height`, or it stops
  being square.

- **`@keyframes zw-bob`** is defined in the reference (line 1843:
  `translateY(0) rotate(-2deg)` → `translateY(-7px) rotate(2deg)`) but never
  referenced by any element. It was not ported. If a floating/bobbing element is
  wanted later, that is the intended motion.

- **Tilt via React state.** The reference calls `setState` on every `mousemove`,
  re-rendering the whole app per pointer move. Free in the canvas runtime,
  wasteful here — the transform is written straight to the element instead.

- **Auto-scroll driven by both rAF and a 32ms interval.** The reference runs
  both and has them detect each other to survive rAF throttling. One rAF loop
  with a time-based delta is used here; it is equivalent and does not need the
  mutual-detection dance.

- **Reveal's hidden state.** The reference sets `opacity: 0` from JS, so a
  script failure would leave content permanently invisible. Here the hidden
  state is gated on `data-reveal-armed`, which only the client sets — no JS
  means content is simply visible. The reference's 2600ms failsafe is kept.

- **No motion guards in the reference.** Every ported effect here honours
  `prefers-reduced-motion: reduce`, and the cursor and tilt additionally require
  a fine pointer. The media queries are *watched*, not read once, so a hybrid
  device that gains a mouse mid-session behaves correctly.

## 6. Scroll reveal — where it is applied, and when it does nothing

The mechanism lives in `lib/store/arm-reveal.ts` rather than inside the React
component, so it is testable without a browser. Three overlapping release paths
(next-frame for on-screen elements, IntersectionObserver, and a scroll sweep
plus a 2600ms failsafe) exist because a reveal that leaves content permanently
invisible is far worse than one that fires early.

Applied to, matching the reference's ten `data-reveal` targets:

| Surface | Stagger |
| --- | --- |
| Home: category tiles, catalog strip, gifting block, reviews block, bulk teaser | none |
| Home: the three gifting steps | 60 / 180 / 300ms |
| Home: each review card | 120ms apart |
| Catalog grid: each product card | 60ms apart, capped at 7 steps |
| PDP: related products | none |

**It does nothing at all when the visitor has reduced motion enabled** — which
is the first thing to check if the animation seems missing. On Windows that is
Settings → Accessibility → Visual effects → Animation effects; on macOS,
System Settings → Accessibility → Display → Reduce motion. That is deliberate:
`prefers-reduced-motion: reduce` is a request not to animate, and it also
disables the custom cursor, the gallery tilt, the marquee and the hero drift.

The second thing to check: a section already on screen when the page loads
reveals immediately rather than on scroll, so on a tall window the first
sections animate during load and only the lower ones animate as you scroll.
