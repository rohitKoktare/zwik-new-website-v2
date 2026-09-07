"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { useCart } from "@/components/store/cart-provider";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Catalog" },
  { href: "/bulk-gifting", label: "Bulk gifting" },
  { href: "/about", label: "About" },
];

/** Shared underline for both the desktop row and the mobile sheet's rows. */
function navLinkClasses(isActive: boolean, extra: string) {
  return `flex items-center font-mono text-xs tracking-[1.2px] uppercase transition-colors duration-150 hover:bg-[var(--gray-80)] hover:text-white hover:no-underline ${extra} ${
    isActive ? "bg-[var(--gray-90)] text-white" : "text-[var(--gray-30)]"
  }`;
}

/**
 * Site header.
 *
 * The full nav row (4 links + "Ask a question" + Cart) doesn't fit a phone
 * width — that's what was breaking. Below `md` the row collapses to just the
 * logo and the cart button, and everything else moves into a shadcn Sheet
 * (components/ui/sheet.tsx) opened from a hamburger trigger, styled to match
 * the cart drawer's own dark slide-in panel rather than the sheet's generic
 * light default.
 */
export function SiteHeader({ waLink }: { waLink: string }) {
  const pathname = usePathname();
  const { count, openCart } = useCart();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function closeMobileNav() {
    setMobileNavOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 flex h-[60px] items-stretch justify-between bg-[var(--gray-100)] text-white">
      <div className="flex items-stretch">
        <Link
          href="/"
          className="flex items-center gap-2.5 border-r border-[var(--gray-90)] px-4 font-mono text-[17px] font-semibold tracking-[3px] text-white transition-colors duration-150 hover:bg-[var(--magenta-60)] hover:text-white hover:no-underline sm:px-[22px]"
        >
          <span className="block h-3 w-3 bg-[var(--magenta-60)]" aria-hidden />
          ZWIK
        </Link>

        {/* Desktop only — this row is exactly what overflowed a phone width. */}
        <nav className="hidden items-stretch md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={navLinkClasses(isActive, "px-[18px]")}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-stretch">
        {/* Desktop only. Reachable on mobile from inside the sheet instead. */}
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center border-l border-[var(--gray-90)] px-5 font-mono text-xs tracking-[1.2px] text-[var(--gray-30)] uppercase transition-colors duration-150 hover:bg-[var(--gray-80)] hover:text-white hover:no-underline md:flex"
        >
          Ask a question
        </a>

        <button
          type="button"
          onClick={openCart}
          aria-label="Open cart"
          className="flex items-center gap-2 bg-[var(--magenta-60)] px-4 font-mono text-xs tracking-[1.2px] text-white uppercase transition-colors duration-150 hover:bg-[var(--purple-60)] sm:gap-2.5 sm:px-6"
        >
          <span className="hidden sm:inline">Cart</span>
          <span className="min-w-6 bg-white px-1.5 py-0.5 text-center font-semibold text-[var(--magenta-60)]">
            {count}
          </span>
        </button>

        {/* Mobile only — the hamburger that replaces everything hidden above. */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                aria-label="Open menu"
                className="h-full w-12 rounded-none border-l border-[var(--gray-90)] text-white hover:bg-[var(--gray-80)] hover:text-white md:hidden"
              />
            }
          >
            <MenuIcon />
          </SheetTrigger>

          <SheetContent
            side="right"
            showCloseButton={false}
            className="w-full max-w-xs gap-0 border-l border-[var(--gray-90)] bg-[var(--gray-100)] p-0 text-white"
          >
            {/* Matches components/store/cart-drawer.tsx's own top bar exactly,
                so the two slide-in panels on this site read as one system. */}
            <div className="flex h-[60px] items-center justify-between border-b border-[var(--gray-90)] pr-3 pl-5">
              <SheetTitle className="font-mono text-[13px] font-semibold tracking-[2px] text-white uppercase">
                Menu
              </SheetTitle>
              <button
                type="button"
                onClick={closeMobileNav}
                aria-label="Close menu"
                className="flex h-10 w-10 items-center justify-center text-lg hover:bg-[var(--magenta-60)]"
              >
                ✕
              </button>
            </div>

            <nav className="flex flex-col" aria-label="Primary">
              {NAV_LINKS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMobileNav}
                    className={navLinkClasses(
                      isActive,
                      "h-14 border-b border-[var(--gray-90)] px-5",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {link.label}
                  </Link>
                );
              })}
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMobileNav}
                className={navLinkClasses(false, "h-14 px-5")}
              >
                Ask a question
              </a>
            </nav>

            <button
              type="button"
              onClick={() => {
                closeMobileNav();
                openCart();
              }}
              className="mt-auto flex h-14 items-center justify-between border-t border-[var(--gray-90)] bg-[var(--magenta-60)] px-5 font-mono text-xs tracking-[1.2px] text-white uppercase transition-colors duration-150 hover:bg-[var(--purple-60)]"
            >
              Cart
              <span className="min-w-6 bg-white px-1.5 py-0.5 text-center font-semibold text-[var(--magenta-60)]">
                {count}
              </span>
            </button>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
