import AuthFlowPage from "@/components/AuthFlowPage";
import RegisterForm from "./RegisterForm";

export default function RegisterPage() {
  return (
    <AuthFlowPage title="booksnap" subtitle="教育圖書資產管理系統">
      <RegisterForm />
    </AuthFlowPage>
  );
}
