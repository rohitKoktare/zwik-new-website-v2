import {
  AdminHeaderSkeleton,
  AdminLoadingShell,
  AdminTableSkeleton,
} from "@/components/admin/admin-loading";

export default function Loading() {
  return (
    <AdminLoadingShell label="Loading assets">
      <AdminHeaderSkeleton />
      <AdminTableSkeleton columns={4} />
    </AdminLoadingShell>
  );
}
