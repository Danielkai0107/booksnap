import Link from "next/link";

export default function RegisterPendingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-10 bg-white">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-5">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-emerald-600"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          註冊申請已送出
        </h1>
        <p className="mt-3 text-sm text-neutral-500 leading-relaxed">
          營運方收到申請後會盡快審核。
          <br />
          通過後即可使用註冊時填寫的 Email 與密碼登入。
        </p>
        <Link
          href="/login"
          className="mt-8 inline-flex w-full items-center justify-center bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-3 rounded-2xl transition"
        >
          回登入頁
        </Link>
      </div>
    </main>
  );
}
