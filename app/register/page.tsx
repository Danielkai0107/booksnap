import Link from "next/link";
import RegisterForm from "./RegisterForm";

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-10 py-10 bg-white">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-neutral-900">
          booksnap
        </h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
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
