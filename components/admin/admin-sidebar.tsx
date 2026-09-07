"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/campaigns", label: "Campaigns" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/assets", label: "Assets" },
  { href: "/admin/homepage", label: "Homepage" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit-logs", label: "Audit logs" },
];

export function AdminSidebar({
  displayName,
  role,
}: {
  displayName: string | null;
  role: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin"
      className="flex w-56 flex-none flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4 font-mono text-sm font-semibold tracking-[2px]">
        <span className="block size-3 bg-sidebar-primary" aria-hidden />
        ZWIK
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="border-t border-sidebar-border p-3">
        <p className="truncate text-xs font-medium">{displayName ?? "Admin"}</p>
        <p className="mt-0.5 font-mono text-[10px] tracking-wider uppercase opacity-70">
          {role.replace("_", " ")}
        </p>
        <form action={signOutAction} className="mt-3">
          <button
            type="submit"
            className="w-full border border-sidebar-border px-3 py-1.5 text-left text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
