import AuthStatusToast from "@/components/AuthStatusToast";
import { requireSuperAdmin } from "@/lib/auth";

// 通過驗證後直接 pass-through children，由各頁面自行用 <SuperAdminShell>
// 包裹自己的內容。以前在這層包 Shell 會跟 [orgId] 等詳情頁的 Shell 形成雙層
// `md:ml-60`，把桌機內容多右移 240px、sidebar/header 也被渲染兩次。
export default async function SuperAdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();

  return (
    <>
      <AuthStatusToast homePath="/super-admin" />
      {children}
    </>
  );
}
