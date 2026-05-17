import { redirect } from "next/navigation";
import AuthFlowPage from "@/components/AuthFlowPage";
import { createClient } from "@/lib/supabase/server";
import VerifyForm from "@/app/login/verify/VerifyForm";

type Search = Promise<{ email?: string; next?: string }>;

export default async function SuperAdminLoginVerifyPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const email = sp.email?.trim().toLowerCase();
  if (!email) {
    redirect("/super-admin/login");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const next =
      sp.next && sp.next.startsWith("/") ? sp.next : "/super-admin";
    redirect(next);
  }

  const safeNext =
    sp.next && sp.next.startsWith("/") ? sp.next : "/super-admin";

  return (
    <AuthFlowPage
      title="booksnap · 營運後台"
      subtitle="輸入登入驗證碼"
      titleClassName="text-2xl font-semibold tracking-tight text-neutral-900"
      subtitleClassName="mt-2 text-sm text-neutral-500"
    >
      <VerifyForm email={email} next={safeNext} variant="super" />
    </AuthFlowPage>
  );
}
