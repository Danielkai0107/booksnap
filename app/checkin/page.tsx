"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CheckinAdminPage() {
  const router = useRouter();
  const [name, setName] = useState("");

  const handleStart = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    sessionStorage.setItem("adminName", trimmed);
    sessionStorage.removeItem("books");
    router.push("/checkin/scan");
  };

  return (
    <main className="min-h-screen flex flex-col">
      <nav className="w-full border-b border-black/[0.06]">
        <div className="max-w-5xl mx-auto px-6 sm:px-10 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm text-neutral-500 hover:text-neutral-900 transition"
          >
            返回
          </Link>
          <span className="text-sm font-medium tracking-tight text-neutral-900">
            入庫
          </span>
          <span className="w-12" />
        </div>
      </nav>

      <section className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10">
        <div className="w-full max-w-md mx-auto -mt-10">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-400 mb-4">
            Step 1 of 3
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-neutral-900 leading-[1.15]">
            請輸入管理員名稱
          </h1>
          <p className="mt-4 text-sm text-neutral-500 leading-relaxed">
            此名稱會記錄為本次入庫的負責人，
            可在後台查詢與匯出時對應。
          </p>

          <div className="mt-10">
            <label className="block text-xs font-medium text-neutral-500 mb-2">
              管理員名稱
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：王小明"
              className="w-full px-4 py-3 text-base rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition"
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
              autoFocus
            />

            <button
              onClick={handleStart}
              disabled={!name.trim()}
              className="mt-4 w-full bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3.5 rounded-lg transition disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
            >
              開始批量入庫
            </button>

            <p className="text-xs text-neutral-400 mt-5 text-center leading-relaxed">
              下一步將開啟相機，請允許瀏覽器使用相機權限
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
