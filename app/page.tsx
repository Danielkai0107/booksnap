import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      <nav className="w-full border-b border-black/[0.06]">
        <div className="max-w-5xl mx-auto px-6 sm:px-10 h-14 flex items-center justify-between">
          <span className="text-sm font-medium tracking-tight text-neutral-900">
            booksnap
          </span>
          <Link
            href="/admin"
            className="text-sm text-neutral-500 hover:text-neutral-900 transition"
          >
            後台管理
          </Link>
        </div>
      </nav>

      <section className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10">
        <div className="w-full max-w-lg mx-auto text-center -mt-14">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-400 mb-5">
            Library Management
          </p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-neutral-900 leading-[1.15]">
            圖書館管理系統
          </h1>
          <p className="mt-5 text-neutral-500 text-base leading-relaxed">
            批次入庫、條碼還書與後台匯出，
            <br className="hidden sm:block" />
            為小型圖書館設計的輕量管理工具。
          </p>

          <div className="mt-12 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:max-w-md sm:mx-auto">
            <Link
              href="/checkin"
              className="flex-1 inline-flex items-center justify-center bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-6 py-3.5 rounded-lg transition"
            >
              開始入庫
            </Link>
            <Link
              href="/return"
              className="flex-1 inline-flex items-center justify-center bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium px-6 py-3.5 rounded-lg transition"
            >
              還書
            </Link>
          </div>
        </div>
      </section>

      <footer className="w-full">
        <div className="max-w-5xl mx-auto px-6 sm:px-10 py-6 text-xs text-neutral-400">
          v0.1.0
        </div>
      </footer>
    </main>
  );
}
