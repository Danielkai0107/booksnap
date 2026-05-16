import AdminShell from "@/components/AdminShell";

export default function Loading() {
  return (
    <AdminShell topbarTitle="訂閱管理" backHref="/settings">
      <div className="py-20 flex justify-center">
        <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
      </div>
    </AdminShell>
  );
}
