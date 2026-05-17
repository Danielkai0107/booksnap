import AuthFlowPage from "@/components/AuthFlowPage";
import LoginForm from "./LoginForm";

type Search = Promise<{ status?: string; error?: string; next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const notice =
    sp.status === "pending"
      ? "你的單位仍在審核中，通過後即可登入"
      : sp.status === "rejected"
        ? "你的單位註冊申請未通過，請聯絡管理員"
        : sp.status === "suspended"
          ? "你的單位目前已停用，請聯絡管理員"
          : sp.status === "password_reset"
            ? "密碼已重設，請以新密碼登入"
            : sp.error === "no_org"
              ? "此帳號尚未綁定單位，請聯絡管理員"
              : sp.error === "invalid_link"
                ? "重設連結已失效或已使用，請重新申請"
                : sp.error === "already_registered"
                  ? "此 Email 已註冊，請直接登入"
                  : null;

  return (
    <AuthFlowPage
      title="booksnap"
      subtitle="教育圖書資產管理系統"
    >
      <LoginForm initialNotice={notice} />
    </AuthFlowPage>
  );
}
