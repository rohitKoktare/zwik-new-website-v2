/**
 * Drives the real header in Chromium at phone viewport widths.
 *
 * The header used to render all four nav links, the WhatsApp link, and the
 * cart button in one unbroken row with no responsive handling at all — it
 * overflowed on any phone-width screen. Fixed by hiding that row below `md`
 * and moving everything into a shadcn Sheet (components/ui/sheet.tsx) behind
 * a hamburger trigger. This script is what proved the fix rather than trusting
 * it from the Tailwind classes alone, and stays as a regression check for
 * whoever next touches the header.
 *
 * Usage: npm run dev (separately), then npm run check:mobile-nav
 */
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const VIEWPORTS = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone 12/13", width: 390, height: 844 },
  { name: "small Android", width: 360, height: 800 },
];

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
};

async function run() {
  const browser = await chromium.launch({ headless: true });

  for (const viewport of VIEWPORTS) {
    console.log(`\n=== ${viewport.name} (${viewport.width}x${viewport.height}) ===`);
    const page = await browser.newPage({ viewport });
    await page.goto(BASE_URL, { waitUntil: "networkidle" });

    // 1. No horizontal overflow anywhere on the page — the actual "breaking".
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    check(
      "no horizontal page overflow",
      overflow.scrollWidth <= overflow.clientWidth,
      `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
    );

    // 2. The header itself doesn't overflow its own viewport width.
    const headerBox = await page.locator("header").first().boundingBox();
    check(
      "header fits within viewport width",
      headerBox && headerBox.width <= viewport.width,
      `header width=${headerBox?.width}`,
    );

    // 3. Desktop nav links are hidden (this is what used to overflow).
    const desktopNavVisible = await page.locator('nav[aria-label="Primary"]').first().isVisible();
    check("desktop nav row is hidden below md", !desktopNavVisible);

    // 4. Hamburger trigger is visible and the cart button is reachable.
    const hamburger = page.getByRole("button", { name: "Open menu" });
    check("hamburger trigger is visible", await hamburger.isVisible());
    check("cart button is visible", await page.getByRole("button", { name: "Open cart" }).isVisible());

    // 5. Open the sheet, confirm the nav links appear, confirm it's scoped to viewport.
    await hamburger.click();
    await page.waitForTimeout(400); // let the slide-in transition finish
    const sheetVisible = await page.getByRole("dialog").isVisible();
    check("sheet opens on tap", sheetVisible);

    const catalogLink = page.getByRole("link", { name: "Catalog" });
    check("nav link is visible inside the open sheet", await catalogLink.isVisible());

    const sheetBox = await page.getByRole("dialog").boundingBox();
    check(
      "open sheet doesn't itself cause horizontal overflow",
      sheetBox && sheetBox.x + sheetBox.width <= viewport.width + 1,
      `sheet right edge=${sheetBox ? sheetBox.x + sheetBox.width : "?"} viewport=${viewport.width}`,
    );

    // 6. Tapping a nav link closes the sheet and actually navigates.
    await catalogLink.click();
    await page.waitForURL("**/products");
    check("nav link click navigated to /products", page.url().endsWith("/products"));
    await page.waitForTimeout(350);
    check("sheet closed after navigating", !(await page.getByRole("dialog").isVisible().catch(() => false)));

    // 7. Re-open and confirm Escape also closes it (basic a11y expectation).
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.waitForTimeout(350);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
    check("Escape closes the sheet", !(await page.getByRole("dialog").isVisible().catch(() => false)));

    await page.close();
  }

  await browser.close();
  console.log(failures === 0 ? "\nAll mobile nav checks passed." : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error("check-mobile-nav failed:", error.message);
  process.exit(1);
});
