import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/auth/actions";
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
    <main className="min-h-screen flex flex-col px-6 sm:px-10 pt-20 md:pt-0 md:items-center md:justify-center bg-white">
      <div className="w-full max-w-sm mx-auto pb-32 md:pb-0">
        <h1 className="text-center text-3xl font-semibold tracking-tight text-neutral-900">
          booksnap
        </h1>
        <p className="mt-5 text-center text-sm text-neutral-400 tracking-wide">
          雙重驗證
        </p>

        <VerifyForm next={safeNext} variant="unit" />

        <div className="mt-6 flex items-center justify-center gap-4 text-sm text-neutral-500">
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
      </div>
    </main>
  );
}
