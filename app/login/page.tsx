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
      ? "你的單位仍在審核中，通過後即可登入"
      : sp.status === "rejected"
      ? "你的單位註冊申請未通過，請聯絡管理員"
      : sp.status === "suspended"
      ? "你的單位目前已停用，請聯絡管理員"
      : sp.error === "no_org"
      ? "此帳號尚未綁定單位，請聯絡管理員"
      : null;

  return (
    <main className="min-h-screen flex flex-col px-6 sm:px-10 pt-20 md:pt-0 md:items-center md:justify-center bg-white">
      <div className="w-full max-w-sm mx-auto pb-32 md:pb-0">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-neutral-900">
          booksnap
        </h1>
        <p className="mt-2 text-center text-xs text-neutral-400 tracking-wide">
          教育圖書資產管理系統
        </p>
        <p className="mt-5 text-center text-sm text-neutral-500">
          單位登入
        </p>

        <LoginForm initialNotice={notice} />

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
