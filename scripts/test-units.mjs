/**
 * Unit tests for the pure logic that is easy to get quietly wrong.
 *
 * Run with `npm test`. No test framework: these modules have no React and no
 * network, so Node's own type-stripping runs them directly. That keeps the
 * dependency footprint at zero for the things most worth testing.
 *
 * Covers, and why each is here rather than left to manual checking:
 *
 *  - **arm-reveal** — the scroll-reveal trigger. Its first version fired every
 *    reveal on the page 2.6s after load regardless of scroll position, so the
 *    animation was over before a reader reached it. Verified in a browser via
 *    `scripts/check-animations.mjs`; the invariants are pinned here.
 *  - **campaigns/message** — guarantees the WhatsApp opt-out line is present on
 *    every campaign message and that the text fits in a wa.me URL. The original
 *    limit counted characters, which let a 900-character Hindi message produce
 *    an 8,162-character URL.
 *  - **validation/common** — phone normalisation. `wa.me/<10 digits>` does not
 *    resolve to a chat, so a missing country code meant every reply link built
 *    from a captured number was dead.
 */

let failures = 0;
let suite = "";

function describe(name) {
  suite = name;
  console.log(`\n${name}`);
}

function check(label, condition, detail = "") {
  const mark = condition ? "  ok  " : "  FAIL";
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

// ---------------------------------------------------------------------------
// DOM stubs for arm-reveal. Deliberately minimal: only what the module touches.
// ---------------------------------------------------------------------------

function makeElement(top, height = 300) {
  const attrs = {};
  return {
    dataset: new Proxy(attrs, {
      set(t, k, v) {
        t[k] = v;
        return true;
      },
      get(t, k) {
        return t[k];
      },
    }),
    attrs,
    getBoundingClientRect: () => ({ top, bottom: top + height }),
    scrollTo: (next) => {
      top = next;
    },
  };
}

function installStubs({ innerHeight = 900 } = {}) {
  const listeners = {};
  const observers = [];
  let frames = [];
  let timers = [];

  globalThis.window = {
    innerHeight,
    addEventListener: (type, fn) => {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    },
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout: (id) => {
      if (timers[id - 1]) timers[id - 1].cleared = true;
    },
  };

  globalThis.requestAnimationFrame = (fn) => {
    frames.push(fn);
    return frames.length;
  };
  globalThis.cancelAnimationFrame = () => {};

  globalThis.IntersectionObserver = class {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = [];
      observers.push(this);
    }
    observe(el) {
      this.observed.push(el);
    }
    unobserve(el) {
      this.observed = this.observed.filter((o) => o !== el);
    }
    disconnect() {
      this.observed = [];
    }
  };

  return {
    listeners,
    observers,
    timers: () => timers,
    flushFrames: () => {
      const pending = frames;
      frames = [];
      for (const fn of pending) fn(0);
    },
    fireTimers: () => {
      for (const t of timers.filter((x) => !x.cleared && !x.fired)) {
        t.fired = true;
        t.fn();
      }
    },
    scroll: () => {
      for (const fn of listeners.scroll ?? []) fn();
    },
  };
}

// ---------------------------------------------------------------------------

const { armReveal, DEFAULT_FAILSAFE_MS } = await import("../lib/store/arm-reveal.ts");

describe("arm-reveal: nothing can be left stuck invisible");
{
  const stubs = installStubs();
  const el = makeElement(2000);
  armReveal(el, { motionReduced: true });
  check(
    "reduced motion touches no attribute at all",
    el.attrs.revealArmed === undefined && el.attrs.revealed === undefined,
  );
  check("reduced motion registers no listeners", (stubs.listeners.scroll ?? []).length === 0);
}
{
  const stubs = installStubs({ innerHeight: 900 });
  const el = makeElement(100);
  armReveal(el, { motionReduced: false });
  check("content on screen at mount is armed", el.attrs.revealArmed === "1");
  stubs.flushFrames();
  check("and released on the next frame", el.attrs.revealed === "1");
}
{
  const stubs = installStubs({ innerHeight: 900 });
  const el = makeElement(2000);
  armReveal(el, { motionReduced: false });
  stubs.observers[0].callback([{ isIntersecting: true, target: el }]);
  check("below-fold content releases on intersect", el.attrs.revealed === "1");
  check("and stops being observed", !stubs.observers[0].observed.includes(el));
}

describe("arm-reveal: the trigger is the viewport, not a fraction of the element");
{
  const stubs = installStubs({ innerHeight: 900 });
  const el = makeElement(2000);
  armReveal(el, { motionReduced: false });
  check(
    "rootMargin trims 25% off the bottom",
    stubs.observers[0]?.options.rootMargin === "0px 0px -25% 0px",
  );
  check(
    "threshold is 0, so height cannot change the trigger",
    stubs.observers[0]?.options.threshold === 0,
    "a fractional threshold fired tall sections almost immediately",
  );
}
{
  const stubs = installStubs({ innerHeight: 900 });
  const el = makeElement(800, 300);
  armReveal(el, { motionReduced: false });
  check(
    "merely grazing the bottom of the screen does not release",
    el.attrs.revealed === undefined,
    "top 800 vs the 675 trigger line",
  );
  check("it waits on the observer instead", stubs.observers[0]?.observed.includes(el));
}
{
  const stubs = installStubs({ innerHeight: 900 });
  const el = makeElement(600, 300);
  armReveal(el, { motionReduced: false });
  stubs.flushFrames();
  check("content past the trigger line releases at mount", el.attrs.revealed === "1");
}

describe("arm-reveal: the failsafe never animates what nobody can see");
{
  const stubs = installStubs({ innerHeight: 900 });
  const el = makeElement(5000, 300);
  armReveal(el, { motionReduced: false, failsafeMs: 1000 });
  stubs.fireTimers();
  check(
    "it declines to release content still below the fold",
    el.attrs.revealed === undefined,
    "the original blanket timer released everything here",
  );
  check("and reschedules itself so nothing gets stranded", stubs.timers().length >= 2);
}
{
  const stubs = installStubs({ innerHeight: 900 });
  const el = makeElement(5000, 300);
  armReveal(el, { motionReduced: false, failsafeMs: 1000 });
  el.scrollTo(400);
  stubs.fireTimers();
  check("it does release once the content is reachable", el.attrs.revealed === "1");
}
check("default failsafe is 8000ms", DEFAULT_FAILSAFE_MS === 8000);

describe("arm-reveal: the scroll fallback agrees with the observer");
{
  const stubs = installStubs({ innerHeight: 900 });
  const el = makeElement(2000, 300);
  armReveal(el, { motionReduced: false });
  el.scrollTo(800);
  stubs.scroll();
  check("no release while only grazing", el.attrs.revealed === undefined);
  el.scrollTo(600);
  stubs.scroll();
  check("releases at the same line the observer uses", el.attrs.revealed === "1");
  check("and unhooks itself", (stubs.listeners.scroll ?? []).length === 0);
}
{
  const stubs = installStubs({ innerHeight: 900 });
  const el = makeElement(2000);
  const cleanup = armReveal(el, { motionReduced: false });
  cleanup();
  check("cleanup removes the scroll listener", (stubs.listeners.scroll ?? []).length === 0);
  check("cleanup disconnects the observer", stubs.observers[0].observed.length === 0);
  check("cleanup clears the failsafe", stubs.timers()[0]?.cleared === true);
}

// ---------------------------------------------------------------------------

const { buildCampaignMessage, previewCampaignMessage, OPT_OUT_LINE, fitsInWhatsAppLink } =
  await import("../lib/campaigns/message.ts");

describe("campaign messages: the opt-out line cannot be lost");
check(
  "appended to every message",
  buildCampaignMessage("Hi {name}, new cottages!", "Asha").trimEnd().endsWith(OPT_OUT_LINE),
);
check(
  "never duplicated when the author wrote their own",
  (buildCampaignMessage("Sale on. Reply STOP to opt out.", "A").match(/reply stop/gi) ?? [])
    .length === 1,
);
check(
  "the preview is the same text that gets sent",
  previewCampaignMessage("Hi {name}, 20% off.") === buildCampaignMessage("Hi {name}, 20% off.", "Asha"),
);
check(
  "a missing name reads naturally instead of leaving a token",
  buildCampaignMessage("Hi {name}!", null) === buildCampaignMessage("Hi {name}!", "  ").valueOf() &&
    buildCampaignMessage("Hi {name}!", null).startsWith("Hi there!"),
);
check(
  "every occurrence of the token is replaced",
  buildCampaignMessage("{name} {name} {name}", "Ravi").startsWith("Ravi Ravi Ravi"),
);

describe("campaign messages: the limit is the encoded URL, not the character count");
check("a long English campaign is accepted", fitsInWhatsAppLink("Hi {name}, " + "new pieces this week. ".repeat(15)));
check("a ~300-character Hindi campaign is accepted", fitsInWhatsAppLink("नमस्ते {name}, " + "हमने नए मिनिएचर कॉटेज जोड़े हैं। ".repeat(9)));
check(
  "900 Devanagari characters are rejected",
  !fitsInWhatsAppLink("क".repeat(900)),
  "encodes to 8,162 characters — this used to pass",
);

// ---------------------------------------------------------------------------

const { normalizeWhatsAppNumber, whatsappNumberSchema } = await import(
  "../lib/validation/common.ts"
);

describe("phone numbers: wa.me needs a country code");
for (const [input, expected] of [
  ["9876543210", "919876543210"],
  ["98765 43210", "919876543210"],
  ["+91 98765 43210", "919876543210"],
  ["09876543210", "919876543210"],
  ["0091 9876543210", "919876543210"],
  ["917666068317", "917666068317"],
  ["+1 415 555 0132", "14155550132"],
  ["+44 7700 900123", "447700900123"],
]) {
  const got = normalizeWhatsAppNumber(input);
  check(`${JSON.stringify(input)} -> ${expected}`, got === expected, got === expected ? "" : `got ${got}`);
}
check("a bare local number is accepted by the schema", whatsappNumberSchema.safeParse("9876543210").success);
check("junk is rejected", !whatsappNumberSchema.safeParse("12345").success);

// ---------------------------------------------------------------------------

console.log(
  failures === 0
    ? "\nAll unit tests passed.\n"
    : `\n${failures} test(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
