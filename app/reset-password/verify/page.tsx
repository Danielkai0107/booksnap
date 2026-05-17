import { redirect } from "next/navigation";
import AuthFlowPage from "@/components/AuthFlowPage";
import { createClient } from "@/lib/supabase/server";
import RecoveryVerifyForm from "./RecoveryVerifyForm";

type Search = Promise<{ email?: string }>;

export default async function ResetPasswordVerifyPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const email = sp.email?.trim().toLowerCase();
  if (!email) {
    redirect("/forgot-password");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    redirect("/reset-password");
  }

  return (
    <AuthFlowPage title="booksnap" subtitle="輸入驗證碼">
      <RecoveryVerifyForm email={email} variant="unit" />
    </AuthFlowPage>
  );
}
