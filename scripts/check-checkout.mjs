/**
 * Drives a real checkout in Chromium: add to cart, place the order, and follow
 * the tracking link.
 *
 * Exists because the old flow was verifiable only by eye — the CTA was an
 * anchor to wa.me, so "did it work" meant "did a WhatsApp tab open", and the
 * cart-not-clearing bug survived precisely because nothing checked it.
 *
 * Usage: npm run dev (separately), then npm run check:checkout
 *
 * Env:
 *   BASE_URL          default http://localhost:3000
 *   HEADED=1          watch it run
 *   EXPECT_DB_FAILURE=1
 *     Asserts the *degraded* path instead of the happy one — that a database
 *     failure does not cost the sale (ARCHITECTURE.md §5.1). Needs a server
 *     started with a deliberately broken service-role key:
 *
 *       SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.invalid npm run dev
 *
 *     Check the server really bound port 3000 — Next silently falls back to
 *     3001 if something else holds it, and the check then passes against a
 *     healthy server and places a real order.
 */

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const EXPECT_DB_FAILURE = process.env.EXPECT_DB_FAILURE === "1";

let failures = 0;
const check = (label, condition, detail = "") => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
};

/** The placeholder number from lib/validation/common.ts — never a real customer. */
const TEST_PHONE = "9876543210";
const TEST_NAME = "Playwright Tester";

/**
 * Delete the order and customer this check created.
 *
 * Scoped tightly on purpose: the order by its own number, and the customer only
 * by the documented placeholder phone. Never a blanket delete — this runs
 * against the live database.
 *
 * Failing to clean up is reported but not counted as a test failure: the
 * checkout itself is what's under test, and a missing .env.local shouldn't
 * turn a passing run red.
 */
async function cleanUp(orderNumber) {
  if (!orderNumber) return;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const { loadEnv } = await import("./lib/env.mjs");
    const env = loadEnv(process.cwd());

    const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Orders first: customer_id is ON DELETE SET NULL, so removing the customer
    // first would leave the test order behind, orphaned and unattributable.
    await db.from("orders").delete().eq("order_number", orderNumber);
    await db.from("customers").delete().eq("phone", `91${TEST_PHONE}`).eq("name", TEST_NAME);

    console.log(`\nCleaned up ${orderNumber} and the test customer.`);
  } catch (error) {
    console.log(`\nCould not clean up ${orderNumber} — delete it by hand: ${error.message}`);
  }
}

async function run() {
  const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
  // Desktop, because "it doesn't look good on laptop" is the case being fixed.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
  });

  console.log(
    `\nDriving a checkout at ${BASE_URL}${EXPECT_DB_FAILURE ? " (expecting the database write to fail)" : ""}\n`,
  );

  // --- Add a product ---
  await page.goto(`${BASE_URL}/products`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add to cart" }).first().click();

  const drawer = page.getByRole("dialog", { name: "Your order" });
  await drawer.waitFor({ state: "visible", timeout: 10_000 });
  check("cart drawer opens on add", await drawer.isVisible());

  // --- Fill the details ---
  await page.locator("#cart-name").fill(TEST_NAME);
  await page.locator("#cart-phone").fill(TEST_PHONE);
  await page.locator("#cart-city").fill("Pune 411001");
  await page.locator("#cart-note").fill("automated checkout check");

  // --- Place the order ---
  const placeButton = page.getByRole("button", { name: "Place order" });
  check("the CTA is a button, not a WhatsApp link", await placeButton.isVisible());

  // No new tab may open from this click — that was the old behaviour.
  let openedPopup = false;
  page.context().on("page", () => {
    openedPopup = true;
  });

  await placeButton.click();

  const confirmation = page.getByRole("dialog").filter({ hasText: "Order received" });
  await confirmation.waitFor({ state: "visible", timeout: 20_000 });
  check("confirmation dialog opens", await confirmation.isVisible());
  check("placing the order does NOT hijack the tab to WhatsApp", !openedPopup);

  // --- The order number ---
  const dialogText = await confirmation.innerText();
  const orderNumber = dialogText.match(/ZW-\d{4}-\d{4}/)?.[0] ?? null;

  if (EXPECT_DB_FAILURE) {
    // Nothing was saved, so there is no number — and inventing one would send
    // the customer to WhatsApp quoting a reference ZWIK cannot look up.
    check("no order number is invented when the write fails", orderNumber === null, orderNumber ?? "none");
    check("the dialog says the reference could not be saved", /couldn.t save an order reference/i.test(dialogText));
  } else {
    check("dialog shows a ZW-YYMM-NNNN order number", orderNumber !== null, orderNumber ?? "none found");
  }

  // Both paths, always: this is what stops a database problem costing the sale.
  check(
    "dialog offers WhatsApp",
    await confirmation.getByRole("link", { name: /Send details on WhatsApp/i }).isVisible(),
  );
  check(
    "dialog offers the copy fallback (the laptop fix)",
    await confirmation.getByRole("button", { name: /Copy order summary/i }).isVisible(),
  );
  check("dialog shows the total either way", /₹/.test(dialogText));

  // --- The tracking link ---
  const trackingLink = confirmation.getByRole("link", { name: /tracking page/i });
  const trackingHref = EXPECT_DB_FAILURE ? null : await trackingLink.getAttribute("href");

  if (EXPECT_DB_FAILURE) {
    check(
      "no tracking link is offered (there is no order to track)",
      !(await trackingLink.isVisible().catch(() => false)),
    );
  } else {
    check("dialog links to a tracking page", Boolean(trackingHref), trackingHref ?? "none");
  }

  // --- What happens to the cart ---
  await confirmation.getByRole("button", { name: /Keep browsing/i }).click();
  await page.waitForTimeout(400);

  const cartCount = (await page.getByRole("button", { name: "Open cart" }).innerText()).trim();

  if (EXPECT_DB_FAILURE) {
    /*
     * The cart is the customer's only surviving copy of what they chose, so it
     * has to stay. Clearing it would mean anyone who closes this dialog without
     * sending the WhatsApp message has lost the order outright.
     */
    check("cart is PRESERVED when the write fails, so the order can be retried", !cartCount.endsWith("0"), `badge="${cartCount.replace(/\n/g, " ")}"`);
  } else {
    check("cart badge is back to 0 after placing", cartCount.endsWith("0"), `badge="${cartCount.replace(/\n/g, " ")}"`);

    // Reload to prove it was cleared in localStorage, not just in memory.
    await page.reload({ waitUntil: "networkidle" });
    const afterReload = (await page.getByRole("button", { name: "Open cart" }).innerText()).trim();
    check(
      "cart is still empty after a reload (cleared in storage)",
      afterReload.endsWith("0"),
      `badge="${afterReload.replace(/\n/g, " ")}"`,
    );
  }

  // --- Follow the tracking link ---
  if (trackingHref) {
    await page.goto(`${BASE_URL}${trackingHref}`, { waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();

    check("tracking page shows the same order number", orderNumber !== null && body.includes(orderNumber));
    // innerText applies CSS text-transform in Chromium and the badge is
    // uppercased, so this has to be case-insensitive.
    check(
      "tracking page shows the customer-facing status",
      /received/i.test(body),
    );
    check(
      "tracking page does NOT leak admin copy",
      !body.includes("You have spoken to the customer") && !body.includes("Placed, unconfirmed"),
    );
    check("tracking page states nothing is charged", /nothing has been charged/i.test(body));
    check(
      "tracking page is noindex",
      (await page.locator('meta[name="robots"]').first().getAttribute("content"))?.includes(
        "noindex",
      ) ?? false,
    );
  }

  /*
   * An unknown or malformed token must reveal nothing.
   *
   * Deliberately NOT asserting a 404 status: this route streams, so the headers
   * are already sent when notFound() runs and the status stays 200. That is
   * documented Next behaviour, not a defect (next/dist/docs, not-found.md and
   * loading.md#status-codes). What actually protects the URL is the noindex
   * tag, which is what gets checked here — along with the far more important
   * property that no order data leaks.
   */
  for (const [label, token] of [
    ["unknown token", "00000000-0000-4000-8000-000000000000"],
    ["malformed token", "not-a-uuid"],
  ]) {
    await page.goto(`${BASE_URL}/orders/${token}`, { waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();

    check(`${label} renders the not-found page`, /could not be found|not found/i.test(body));
    check(
      `${label} leaks no order data`,
      !/ZW-\d{4}-\d{4}/.test(body) && !/₹/.test(body),
    );
    check(
      `${label} is marked noindex`,
      // Two tags can be present here: this route's own, plus the one Next
      // injects into a streamed 404. Either satisfies the requirement.
      (await page.locator('meta[name="robots"]').first().getAttribute("content"))?.includes(
        "noindex",
      ) ?? false,
    );
  }

  if (consoleErrors.length) {
    console.log(`\nConsole errors (${new Set(consoleErrors).size} unique):`);
    for (const e of [...new Set(consoleErrors)].slice(0, 6)) console.log(`  ${e}`);
  }

  await browser.close();

  // This check writes to whatever database the dev server points at, which in
  // practice is the live one. Remove what it created so running it repeatedly
  // doesn't silently fill the admin with fake orders.
  await cleanUp(orderNumber);

  console.log(
    failures === 0
      ? EXPECT_DB_FAILURE
        ? "\nCheckout degrades correctly when the database is unreachable — the sale survives.\n"
        : `\nCheckout works end to end${orderNumber ? ` (placed ${orderNumber})` : ""}.\n`
      : `\n${failures} FAILED\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error("\ncheck-checkout failed:", error.message);
  console.error("Is the dev server running? Start it with `npm run dev`.");
  process.exit(1);
});
