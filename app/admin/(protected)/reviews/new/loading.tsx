import {
  AdminFormSkeleton,
  AdminHeaderSkeleton,
  AdminLoadingShell,
} from "@/components/admin/admin-loading";

export default function Loading() {
  return (
    <AdminLoadingShell label="Loading the review form">
      <AdminHeaderSkeleton />
      <AdminFormSkeleton fields={7} />
    </AdminLoadingShell>
  );
}
