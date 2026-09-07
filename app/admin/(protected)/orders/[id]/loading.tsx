import {
  AdminFormSkeleton,
  AdminHeaderSkeleton,
  AdminLoadingShell,
} from "@/components/admin/admin-loading";

export default function Loading() {
  return (
    <AdminLoadingShell label="Loading the record">
      <AdminHeaderSkeleton />
      <AdminFormSkeleton fields={5} />
    </AdminLoadingShell>
  );
}
