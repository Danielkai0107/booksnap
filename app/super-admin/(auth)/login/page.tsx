import Link from "next/link";
import SuperAdminLoginForm from "./SuperAdminLoginForm";

type Search = Promise<{ status?: string; error?: string }>;

export default async function SuperAdminLoginPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const notice =
    sp.status === "password_reset"
      ? "密碼已重設，請以新密碼登入"
      : sp.error === "invalid_link"
        ? "重設連結已失效或已使用，請重新申請"
        : null;

  return (
    <main className="min-h-screen flex flex-col px-6 sm:px-10 pt-20 md:pt-0 md:items-center md:justify-center bg-white">
      <div className="w-full max-w-sm mx-auto pb-32 md:pb-0">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-neutral-900">
          booksnap · 營運後台
        </h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          超級管理員登入
        </p>

        <SuperAdminLoginForm initialNotice={notice} />

        <p className="mt-4 text-center text-sm">
          <Link
            href="/super-admin/forgot-password"
            className="text-neutral-500 hover:text-neutral-900 hover:underline"
          >
            忘記密碼？
          </Link>
        </p>
      </div>
    </main>
  );
}
