"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/store/cart-provider";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Catalog" },
  { href: "/bulk-gifting", label: "Bulk gifting" },
  { href: "/about", label: "About" },
];

export function SiteHeader({ waLink }: { waLink: string }) {
  const pathname = usePathname();
  const { count, openCart } = useCart();

  return (
    <header className="sticky top-0 z-40 flex h-[60px] items-stretch justify-between bg-[var(--gray-100)] text-white">
      <div className="flex items-stretch">
        <Link
          href="/"
          className="flex items-center gap-2.5 border-r border-[var(--gray-90)] px-[22px] font-mono text-[17px] font-semibold tracking-[3px] text-white transition-colors duration-150 hover:bg-[var(--magenta-60)] hover:text-white hover:no-underline"
        >
          <span className="block h-3 w-3 bg-[var(--magenta-60)]" aria-hidden />
          ZWIK
        </Link>
        <nav className="flex items-stretch" aria-label="Primary">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center px-[18px] font-mono text-xs tracking-[1.2px] uppercase transition-colors duration-150 hover:bg-[var(--gray-80)] hover:text-white hover:no-underline ${
                  isActive
                    ? "bg-[var(--gray-90)] text-white"
                    : "text-[var(--gray-30)]"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-stretch">
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center border-l border-[var(--gray-90)] px-5 font-mono text-xs tracking-[1.2px] text-[var(--gray-30)] uppercase transition-colors duration-150 hover:bg-[var(--gray-80)] hover:text-white hover:no-underline"
        >
          Ask a question
        </a>
        <button
          type="button"
          onClick={openCart}
          className="flex items-center gap-2.5 bg-[var(--magenta-60)] px-6 font-mono text-xs tracking-[1.2px] text-white uppercase transition-colors duration-150 hover:bg-[var(--purple-60)]"
        >
          Cart
          <span className="min-w-6 bg-white px-1.5 py-0.5 text-center font-semibold text-[var(--magenta-60)]">
            {count}
          </span>
        </button>
      </div>
    </header>
  );
}
