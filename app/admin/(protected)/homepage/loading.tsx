import {
  AdminFormSkeleton,
  AdminHeaderSkeleton,
  AdminLoadingShell,
} from "@/components/admin/admin-loading";

export default function Loading() {
  return (
    <AdminLoadingShell label="Loading homepage settings">
      <AdminHeaderSkeleton />
      <AdminFormSkeleton fields={6} />
    </AdminLoadingShell>
  );
}
