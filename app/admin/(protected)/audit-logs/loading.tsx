import {
  AdminHeaderSkeleton,
  AdminLoadingShell,
  AdminTableSkeleton,
} from "@/components/admin/admin-loading";

export default function Loading() {
  return (
    <AdminLoadingShell label="Loading audit logs">
      <AdminHeaderSkeleton />
      <AdminTableSkeleton columns={5} />
    </AdminLoadingShell>
  );
}
