import Link from "next/link";
import { redirect } from "next/navigation";
import AuthFlowPage from "@/components/AuthFlowPage";
import { signOutAction } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import VerifyForm from "./VerifyForm";

type Search = Promise<{ next?: string }>;

/**
 * Step 2 of unit login when the account has TOTP enabled. The proxy and
 * `loginAction` redirect AAL1 sessions here; from a UX standpoint this is
 * the "enter your authenticator code" page. AAL2 sessions skip this page
 * entirely (we early-redirect to `/`).
 */
export default async function LoginVerifyPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/login");
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") {
    redirect(sp.next && sp.next.startsWith("/") ? sp.next : "/");
  }

  const safeNext = sp.next && sp.next.startsWith("/") ? sp.next : "/";

  return (
    <AuthFlowPage
      title="booksnap"
      subtitle="雙重驗證"
      after={
        <div className="flex items-center justify-center gap-4 text-sm text-neutral-500">
          <Link href="/login" className="hover:text-neutral-900 hover:underline">
            返回登入
          </Link>
          <span className="text-neutral-300">·</span>
          <form action={signOutAction}>
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
      <VerifyForm next={safeNext} variant="unit" />
    </AuthFlowPage>
  );
}
