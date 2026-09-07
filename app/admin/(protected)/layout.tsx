import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requireAdmin } from "@/lib/auth/guard";

/**
 * Authorization boundary for the whole admin area.
 *
 * This protects rendering only. Every server action must call its own
 * guard as well — a layout cannot gate an action invocation
 * (DEVELOPMENT_STANDARDS.md §8).
 */
export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAdmin();

  return (
    <div className="flex min-h-screen">
      <AdminSidebar displayName={profile.displayName} role={profile.role} />
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl p-8">{children}</div>
      </div>
    </div>
  );
}
