import Link from "next/link";
import LoginForm from "./LoginForm";

type Search = Promise<{ status?: string; error?: string; next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const notice =
    sp.status === "pending"
      ? "你的單位仍在審核中，通過後即可登入。"
      : sp.status === "rejected"
      ? "你的單位註冊申請未通過，請聯絡管理員。"
      : sp.status === "suspended"
      ? "你的單位目前已停用，請聯絡管理員。"
      : sp.error === "no_org"
      ? "此帳號尚未綁定單位，請聯絡管理員。"
      : null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-10 bg-white">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-neutral-900">
          booksnap
        </h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          單位登入
        </p>

        {notice && (
          <div className="mt-6 px-4 py-3 bg-amber-50 text-amber-800 border border-amber-100 rounded-lg text-sm">
            {notice}
          </div>
        )}

        <LoginForm />

        <p className="mt-6 text-center text-sm text-neutral-500">
          還沒有單位帳號？
          <Link
            href="/register"
            className="ml-1 text-neutral-900 font-medium hover:underline"
          >
            註冊單位
          </Link>
        </p>
      </div>
    </main>
  );
}
