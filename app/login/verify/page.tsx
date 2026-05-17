import { redirect } from "next/navigation";
import AuthFlowPage from "@/components/AuthFlowPage";
import { createClient } from "@/lib/supabase/server";
import VerifyForm from "./VerifyForm";

type Search = Promise<{ email?: string; next?: string }>;

export default async function LoginVerifyPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const email = sp.email?.trim().toLowerCase();
  if (!email) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const next = sp.next && sp.next.startsWith("/") ? sp.next : "/";
    redirect(next);
  }

  const safeNext = sp.next && sp.next.startsWith("/") ? sp.next : "/";

  return (
    <AuthFlowPage title="booksnap" subtitle="輸入登入驗證碼">
      <VerifyForm email={email} next={safeNext} variant="unit" />
    </AuthFlowPage>
  );
}
