import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { SettingsForm } from "@/components/admin/settings/settings-form";
import { getSettingsForAdmin } from "@/lib/supabase/queries/admin-settings";
import { requireRole, SETTINGS_ROLES } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  // Page-level role gate. The action re-checks independently.
  await requireRole(SETTINGS_ROLES);

  const settings = await getSettingsForAdmin();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Brand details, WhatsApp ordering, and SEO defaults. Changes here affect the whole public site."
      />
      <SettingsForm settings={settings} />
    </>
  );
}
