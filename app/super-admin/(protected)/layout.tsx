import AuthStatusToast from "@/components/AuthStatusToast";
import SuperAdminShell from "@/components/SuperAdminShell";
import { requireSuperAdmin } from "@/lib/auth";

export default async function SuperAdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();

  return (
    <>
      <AuthStatusToast homePath="/super-admin" />
      <SuperAdminShell>{children}</SuperAdminShell>
    </>
  );
}
