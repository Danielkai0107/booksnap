import Link from "next/link";
import RegisterForm from "./RegisterForm";

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex flex-col px-6 sm:px-10 pt-12 md:pt-0 md:items-center md:justify-center md:py-10 bg-white">
      <div className="w-full max-w-sm mx-auto pb-36 md:pb-0">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-neutral-900">
          booksnap
        </h1>
        <p className="mt-2 text-center text-xs text-neutral-400 tracking-wide">
          教育圖書資產管理系統
        </p>
        <p className="mt-3 text-center text-sm text-neutral-500">
          以單位名義註冊
        </p>

        <RegisterForm />

        <p className="mt-6 text-center text-sm text-neutral-500">
          已有單位帳號？
          <Link
            href="/login"
            className="ml-1 text-neutral-900 font-medium hover:underline"
          >
            前往登入
          </Link>
        </p>
      </div>
    </main>
  );
}
