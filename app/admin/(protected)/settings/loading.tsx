import {
  AdminFormSkeleton,
  AdminHeaderSkeleton,
  AdminLoadingShell,
} from "@/components/admin/admin-loading";

export default function Loading() {
  return (
    <AdminLoadingShell label="Loading settings">
      <AdminHeaderSkeleton />
      <AdminFormSkeleton fields={10} />
    </AdminLoadingShell>
  );
}
