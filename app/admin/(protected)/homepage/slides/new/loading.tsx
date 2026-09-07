import {
  AdminFormSkeleton,
  AdminHeaderSkeleton,
  AdminLoadingShell,
} from "@/components/admin/admin-loading";

export default function Loading() {
  return (
    <AdminLoadingShell label="Loading the slide form">
      <AdminHeaderSkeleton />
      <AdminFormSkeleton fields={7} />
    </AdminLoadingShell>
  );
}
