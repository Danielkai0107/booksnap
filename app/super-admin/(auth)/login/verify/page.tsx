import Link from "next/link";
import { redirect } from "next/navigation";
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
    <main className="min-h-screen flex flex-col px-6 sm:px-10 pt-20 md:pt-0 md:items-center md:justify-center bg-white">
      <div className="w-full max-w-sm mx-auto pb-32 md:pb-0">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-neutral-900">
          booksnap · 營運後台
        </h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          雙重驗證
        </p>

        <VerifyForm next={safeNext} variant="super" />

        <div className="mt-6 flex items-center justify-center gap-4 text-sm text-neutral-500">
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
      </div>
    </main>
  );
}
