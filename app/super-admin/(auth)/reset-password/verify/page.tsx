import { redirect } from "next/navigation";
import AuthFlowPage from "@/components/AuthFlowPage";
import { createClient } from "@/lib/supabase/server";
import RecoveryVerifyForm from "@/app/reset-password/verify/RecoveryVerifyForm";

type Search = Promise<{ email?: string }>;

export default async function SuperAdminResetPasswordVerifyPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const email = sp.email?.trim().toLowerCase();
  if (!email) {
    redirect("/super-admin/forgot-password");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    redirect("/super-admin/reset-password");
  }

  return (
    <AuthFlowPage
      title="booksnap · 營運後台"
      subtitle="輸入驗證碼"
      titleClassName="text-2xl font-semibold tracking-tight text-neutral-900"
      subtitleClassName="mt-2 text-sm text-neutral-500"
    >
      <RecoveryVerifyForm email={email} variant="super" />
    </AuthFlowPage>
  );
}
