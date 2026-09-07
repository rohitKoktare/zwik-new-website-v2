import {
  AdminHeaderSkeleton,
  AdminLoadingShell,
  AdminTableSkeleton,
} from "@/components/admin/admin-loading";

export default function Loading() {
  return (
    <AdminLoadingShell label="Loading reviews">
      <AdminHeaderSkeleton />
      <AdminTableSkeleton columns={7} />
    </AdminLoadingShell>
  );
}
