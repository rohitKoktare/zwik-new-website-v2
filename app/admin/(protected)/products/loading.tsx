import {
  AdminHeaderSkeleton,
  AdminLoadingShell,
  AdminTableSkeleton,
} from "@/components/admin/admin-loading";

export default function Loading() {
  return (
    <AdminLoadingShell label="Loading products">
      <AdminHeaderSkeleton />
      <AdminTableSkeleton columns={6} />
    </AdminLoadingShell>
  );
}
