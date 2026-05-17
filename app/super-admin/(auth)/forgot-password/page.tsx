import AuthFlowPage from "@/components/AuthFlowPage";
import ForgotPasswordForm from "@/app/forgot-password/ForgotPasswordForm";

export default function SuperAdminForgotPasswordPage() {
  return (
    <AuthFlowPage
      title="booksnap · 營運後台"
      titleClassName="text-2xl font-semibold tracking-tight text-neutral-900"
      subtitle="超級管理員 · 忘記密碼"
      subtitleClassName="mt-2 text-sm text-neutral-500"
    >
      <ForgotPasswordForm variant="super" />
    </AuthFlowPage>
  );
}
