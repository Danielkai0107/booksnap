import AuthFlowPage from "@/components/AuthFlowPage";
import SuperAdminLoginForm from "./SuperAdminLoginForm";

type Search = Promise<{ status?: string; error?: string }>;

export default async function SuperAdminLoginPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const notice =
    sp.status === "password_reset"
      ? "密碼已重設，請以新密碼登入"
      : sp.error === "invalid_link"
        ? "重設連結已失效或已使用，請重新申請"
        : null;

  return (
    <AuthFlowPage
      title="booksnap · 營運後台"
      titleClassName="text-2xl font-semibold tracking-tight text-neutral-900"
      subtitle="超級管理員登入"
      subtitleClassName="mt-2 text-sm text-neutral-500"
    >
      <SuperAdminLoginForm initialNotice={notice} />
    </AuthFlowPage>
  );
}
