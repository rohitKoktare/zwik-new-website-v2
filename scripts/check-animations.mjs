/**
 * Drives the real storefront in Chromium and reports what the animations
 * actually do.
 *
 * Written because `arm-reveal`'s own unit tests all passed while the effect was
 * still reported as missing on the live site. The question was never "does the
 * mechanism work" but "does it fire while the content is on screen" — and that
 * can only be answered by scrolling a real viewport. It found the cause on the
 * first run: 6 of 8 reveals fired before their content was visible.
 *
 * Usage:
 *   npm run dev              # in one terminal
 *   npm run check:animations # in another
 *
 * Env: BASE_URL (default http://localhost:3000), HEADED=1 to watch it run.
 */

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const VIEWPORT = { width: 1440, height: 900 };
const SCROLL_STEP = 300;

/** Every storefront page. A page with no reveals at all is itself a finding. */
const PAGES = ["/", "/products", "/about", "/bulk-gifting", "/contact"];

/**
 * A reveal is "too early" when its top edge was still below this line as it
 * fired — the same 75%-of-viewport trigger `arm-reveal` uses. Measuring the
 * element's top edge rather than the fraction of it on screen matters: a
 * section taller than the viewport can never show a large fraction of itself,
 * so a fraction-based check would flag correct behaviour as a failure.
 */
const ARRIVAL_LINE = 0.75;

/** Reads every reveal wrapper's state and where it sits in the viewport. */
const probe = () =>
  Array.from(document.querySelectorAll("[data-reveal]")).map((el, i) => {
    const rect = el.getBoundingClientRect();
    const heading = el.querySelector("h1, h2, h3");
    const label =
      (heading?.textContent ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40) ||
      `reveal ${i}`;

    return {
      index: i,
      label,
      armed: el.getAttribute("data-reveal-armed") === "1",
      revealed: el.getAttribute("data-revealed") === "1",
      opacity: Number(getComputedStyle(el).opacity),
      top: Math.round(rect.top),
      height: Math.round(rect.height),
      viewport: window.innerHeight,
    };
  });

/** Walks one page top to bottom and reports each reveal's behaviour. */
async function auditPage(page, path) {
  console.log(`\n${"=".repeat(70)}\n${path}\n${"=".repeat(70)}`);

  await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
  // Let hydration land so the effects have run.
  await page.waitForTimeout(600);

  const initial = await page.evaluate(probe);

  if (initial.length === 0) {
    console.log("  no [data-reveal] wrappers on this page — nothing animates on scroll");
    return { path, total: 0, early: 0, never: 0, stuck: 0 };
  }

  console.log(`  ${initial.length} reveal wrapper(s)`);

  // First sample in which each wrapper was seen revealed.
  const flippedAt = new Map();
  const record = (rows) => {
    for (const row of rows) {
      if (row.revealed && !flippedAt.has(row.index)) flippedAt.set(row.index, row);
    }
  };
  record(initial);

  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < pageHeight; y += SCROLL_STEP) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    // Long enough for the observer to fire, shorter than the 400ms transition
    // so a mid-flight opacity is still observable.
    await page.waitForTimeout(150);
    record(await page.evaluate(probe));
  }

  await page.waitForTimeout(600);
  const final = await page.evaluate(probe);

  let early = 0;
  let never = 0;

  for (const row of final) {
    const at = flippedAt.get(row.index);

    if (!at) {
      never++;
      console.log(`    NEVER REVEALED  ${row.label}`);
      continue;
    }

    const line = Math.round(at.viewport * ARRIVAL_LINE);
    const tooEarly = at.top > line;
    if (tooEarly) early++;

    console.log(
      `    ${tooEarly ? "TOO EARLY " : "ok        "}` +
        `top was ${String(at.top).padStart(5)}px (trigger ${line}px) — ${row.label}`,
    );
  }

  const stuck = final.filter((r) => r.opacity < 0.99);
  for (const row of stuck) {
    console.log(`    STUCK HIDDEN    opacity ${row.opacity.toFixed(2)} — ${row.label}`);
  }

  return { path, total: final.length, early, never, stuck: stuck.length };
}

async function run() {
  const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
  const page = await browser.newPage({ viewport: VIEWPORT });

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 150));
  });

  console.log(`\nDriving ${BASE_URL} at ${VIEWPORT.width}x${VIEWPORT.height}`);

  /** Set by the footer counter-scroll section below; folded into the exit code. */
  let footerBroken = false;

  const results = [];
  for (const path of PAGES) {
    results.push(await auditPage(page, path));
  }

  // --- The hero word rotation, on the homepage ---
  console.log(`\n${"=".repeat(70)}\nhero word rotation\n${"=".repeat(70)}`);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  const seen = [];
  // Sampled at 100ms. Polling more coarsely than the interval would make the
  // measured gap an artefact of the sampler rather than of the animation.
  for (let i = 0; i < 90; i++) {
    const word = await page.$eval("h1 span", (el) => el.textContent?.trim() ?? "");
    if (seen.length === 0 || seen[seen.length - 1].word !== word) {
      seen.push({ word, at: Date.now() });
    }
    await page.waitForTimeout(100);
  }

  // The first gap is discarded: sampling starts mid-cycle, so it measures the
  // remainder of a period rather than a whole one.
  const gaps = seen.slice(2).map((s, i) => s.at - seen[i + 1].at);
  console.log(`  ${seen.map((s) => s.word).join(" -> ")}`);
  console.log(
    gaps.length
      ? `  intervals: ${gaps.map((g) => `${g}ms`).join(", ")} (target 2000ms)`
      : "  the word never changed",
  );

  // --- The other reference animations ---
  console.log(`\n${"=".repeat(70)}\nother reference animations\n${"=".repeat(70)}`);
  const others = await page.evaluate(() => {
    const anyWithAnimation = (name) =>
      Array.from(document.querySelectorAll("*")).some((el) =>
        getComputedStyle(el).animationName.includes(name),
      );
    return {
      "marquee ticker": anyWithAnimation("zw-marquee"),
      "hero drift (ken burns)": anyWithAnimation("zw-drift"),
      "card rise": anyWithAnimation("zw-rise"),
      "hero word swap": anyWithAnimation("zw-word"),
      "custom cursor ring": document.querySelectorAll("[class*='z-90']").length > 0,
    };
  });
  for (const [name, present] of Object.entries(others)) {
    console.log(`  ${present ? "present" : "MISSING"}  ${name}`);
  }

  // --- The footer's two counter-scrolling bands ---
  console.log(`\n${"=".repeat(70)}\nfooter counter-scroll\n${"=".repeat(70)}`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(700);

  const footerProbe = () =>
    page.evaluate(() => {
      const x = (el) => (el ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m41 : null);
      const swatch = document.querySelector('footer [class*="zw-swatch-drift"]');
      const word = document.querySelector('footer [class*="zw-marquee"]');
      if (!swatch || !word) return null;
      const halves = [...word.children].map((el) => el.getBoundingClientRect().width);
      return {
        swatchX: x(swatch),
        wordX: x(word),
        swatchDuration: parseFloat(getComputedStyle(swatch).animationDuration),
        wordDuration: parseFloat(getComputedStyle(word).animationDuration),
        swatchOverhang: swatch.getBoundingClientRect().width - window.innerWidth,
        wordWidth: word.getBoundingClientRect().width,
        wordHalves: halves,
        viewport: window.innerWidth,
      };
    });

  const footerFirst = await footerProbe();

  if (!footerFirst) {
    console.log("  MISSING  footer marquee bands not found");
    footerBroken = true;
  } else {
    /**
     * Direction by majority vote across short samples.
     *
     * One before/after pair is not enough: the swatch cycle is ~1.2s, so an
     * interval anywhere near half a cycle can straddle the loop wrap and read
     * backwards. Sampling at roughly a twelfth of a cycle means at most one
     * step is a wrap, leaving the majority unambiguous.
     */
    const xs = { swatchX: [], wordX: [] };
    for (let i = 0; i < 12; i++) {
      const s = await footerProbe();
      xs.swatchX.push(s.swatchX);
      xs.wordX.push(s.wordX);
      await page.waitForTimeout(100);
    }
    const vote = (key) => {
      const deltas = xs[key].slice(1).map((v, i) => v - xs[key][i]);
      return {
        forward: deltas.filter((d) => d > 0.5).length,
        backward: deltas.filter((d) => d < -0.5).length,
      };
    };
    const sw = vote("swatchX");
    const wd = vote("wordX");

    const swatchSpeed = 144 / footerFirst.swatchDuration;
    const wordSpeed = footerFirst.wordWidth / 2 / footerFirst.wordDuration;

    // The strip runs leftward, the wordmark rightward (it carries `reverse`).
    const opposite = sw.backward > sw.forward && wd.forward > wd.backward;
    const faster = swatchSpeed > wordSpeed * 1.5;
    /*
     * Seamless means a -50% translate lands exactly where the loop started,
     * which only holds if the row is exactly two children of equal width —
     * true regardless of how wide the content is or how many words it holds,
     * so this doesn't assume anything about viewport size or word count (the
     * wordmark used to be a wall of 16 tiled "ZWIK"s and is now a single
     * "ZWIK · Your own miniature world" phrase; this check is agnostic to
     * either).
     */
    const [half0, half1] = footerFirst.wordHalves ?? [];
    const seamless =
      Math.round(footerFirst.swatchOverhang) === 144 &&
      footerFirst.wordHalves?.length === 2 &&
      Math.abs(half0 - half1) < 1;

    console.log(
      `  swatch  -> left  (${sw.backward} vs ${sw.forward} steps), ~${swatchSpeed.toFixed(0)} px/s`,
    );
    console.log(
      `  wordmark-> right (${wd.forward} vs ${wd.backward} steps), ~${wordSpeed.toFixed(0)} px/s`,
    );
    console.log(`  ${opposite ? "ok      " : "FAILED  "}they counter-scroll`);
    console.log(`  ${faster ? "ok      " : "FAILED  "}swatch is the faster band`);
    console.log(`  ${seamless ? "ok      " : "FAILED  "}both loop without exposing a gap`);

    if (!opposite || !faster || !seamless) footerBroken = true;
  }

  if (consoleErrors.length) {
    console.log(`\nConsole errors (${new Set(consoleErrors).size} unique):`);
    for (const e of [...new Set(consoleErrors)].slice(0, 6)) console.log(`  ${e}`);
  }

  // --- Summary ---
  console.log(`\n${"=".repeat(70)}\nsummary\n${"=".repeat(70)}`);
  let early = 0;
  let never = 0;
  let stuck = 0;
  let noReveals = 0;

  for (const r of results) {
    early += r.early;
    never += r.never;
    stuck += r.stuck;
    if (r.total === 0) noReveals++;
    console.log(
      `  ${r.path.padEnd(16)} ${String(r.total).padStart(2)} reveals, ` +
        `${r.early} too early, ${r.never} never, ${r.stuck} stuck`,
    );
  }

  await browser.close();

  // Stuck-hidden or never-revealed content is a real failure — the visitor
  // cannot read it. Firing early only degrades the effect, but it is the bug
  // this script exists to catch, so it fails the run too.
  const failed =
    stuck > 0 || never > 0 || early > 0 || noReveals > 0 || footerBroken;
  console.log(
    failed
      ? `\nFAILED: ${early} too early, ${never} never revealed, ${stuck} stuck, ` +
          `${noReveals} page(s) with no reveals${footerBroken ? ", footer counter-scroll broken" : ""}.\n`
      : "\nAll reveals fire while their content is on screen, and the footer bands counter-scroll.\n",
  );
  process.exit(failed ? 1 : 0);
}

run().catch((error) => {
  console.error("\ncheck-animations failed:", error.message);
  console.error("Is the dev server running? Start it with `npm run dev`.");
  process.exit(1);
});
