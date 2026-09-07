import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · ZWIK Admin" },
  // The admin area must never be indexed. robots.ts also disallows /admin;
  // this is the per-page belt to that braces.
  robots: { index: false, follow: false },
};

/**
 * Outer admin layout. Deliberately contains NO authorization check, because
 * /admin/login lives underneath it and must be reachable while signed out.
 * The guard lives in app/admin/(protected)/layout.tsx.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="top-right" richColors />
    </>
  );
}
