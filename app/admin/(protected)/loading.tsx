import {
  AdminFormSkeleton,
  AdminHeaderSkeleton,
  AdminLoadingShell,
} from "@/components/admin/admin-loading";

export default function Loading() {
  return (
    <AdminLoadingShell label="Loading the dashboard">
      <AdminHeaderSkeleton />
      <AdminFormSkeleton fields={4} />
    </AdminLoadingShell>
  );
}
