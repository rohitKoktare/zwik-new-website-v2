import {
  AdminFormSkeleton,
  AdminHeaderSkeleton,
  AdminLoadingShell,
} from "@/components/admin/admin-loading";

export default function Loading() {
  return (
    <AdminLoadingShell label="Loading the product">
      <AdminHeaderSkeleton />
      <AdminFormSkeleton fields={8} />
    </AdminLoadingShell>
  );
}
