import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { CampaignForm } from "@/components/admin/campaigns/campaign-form";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guard";
import { countContactableCustomers } from "@/lib/supabase/queries/admin-customers";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  await requireAdmin();

  const audience = await countContactableCustomers();

  return (
    <>
      <PageHeader
        title="New campaign"
        description="Write the message. You lock in the audience on the next screen, then send each one yourself."
        action={
          // Base UI composes via `render`, not Radix's `asChild`.
          <Button variant="outline" render={<Link href="/admin/campaigns" />}>
            Back to campaigns
          </Button>
        }
      />

      <CampaignForm audienceSize={audience.contactable} />
    </>
  );
}
