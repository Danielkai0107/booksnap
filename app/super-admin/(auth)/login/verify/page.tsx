import Link from "next/link";
import { redirect } from "next/navigation";
import AuthFlowPage from "@/components/AuthFlowPage";
import { createClient } from "@/lib/supabase/server";
import { superAdminSignOut } from "@/app/super-admin/actions";
import VerifyForm from "@/app/login/verify/VerifyForm";

type Search = Promise<{ next?: string }>;

export default async function SuperAdminLoginVerifyPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/super-admin/login");
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") {
    redirect(
      sp.next && sp.next.startsWith("/") ? sp.next : "/super-admin",
    );
  }

  const safeNext = sp.next && sp.next.startsWith("/") ? sp.next : "/super-admin";

  return (
    <AuthFlowPage
      title="booksnap · 營運後台"
      subtitle="雙重驗證"
      titleClassName="text-2xl font-semibold tracking-tight text-neutral-900"
      subtitleClassName="mt-2 text-sm text-neutral-500"
      after={
        <div className="flex items-center justify-center gap-4 text-sm text-neutral-500">
          <Link
            href="/super-admin/login"
            className="hover:text-neutral-900 hover:underline"
          >
            返回登入
          </Link>
          <span className="text-neutral-300">·</span>
          <form action={superAdminSignOut}>
            <button
              type="submit"
              className="hover:text-neutral-900 hover:underline"
            >
              登出
            </button>
          </form>
        </div>
      }
    >
      <VerifyForm next={safeNext} variant="super" />
    </AuthFlowPage>
  );
}
