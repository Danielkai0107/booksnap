import AuthFlowPage from "@/components/AuthFlowPage";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthFlowPage title="booksnap" subtitle="忘記密碼">
      <ForgotPasswordForm variant="unit" />
    </AuthFlowPage>
  );
}
