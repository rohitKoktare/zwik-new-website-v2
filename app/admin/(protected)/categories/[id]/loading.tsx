import {
  AdminFormSkeleton,
  AdminHeaderSkeleton,
  AdminLoadingShell,
} from "@/components/admin/admin-loading";

export default function Loading() {
  return (
    <AdminLoadingShell label="Loading the category">
      <AdminHeaderSkeleton />
      <AdminFormSkeleton fields={5} />
    </AdminLoadingShell>
  );
}
