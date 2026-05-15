"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import MemberPicker from "@/components/MemberPicker";
import { signOutAction } from "./auth/actions";

type Props = {
  orgName: string;
};

export default function HomeClient({ orgName }: Props) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState<"borrow" | "return" | null>(null);

  function openPicker(t: "borrow" | "return") {
    setTarget(t);
    setPickerOpen(true);
  }

  function onSelect(name: string) {
    if (!target) return;
    sessionStorage.setItem("currentMember", name);
    router.push(target === "borrow" ? "/borrow/scan" : "/return/scan");
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6 sm:px-10">
      <div className="w-full max-w-sm mx-auto">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-neutral-900 mb-10">
          booksnap
        </h1>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => openPicker("borrow")}
            className="inline-flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-4 rounded-2xl transition"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
            <span className="leading-none">借書</span>
          </button>
          <button
            type="button"
            onClick={() => openPicker("return")}
            className="inline-flex items-center justify-center gap-2 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium px-4 py-4 rounded-2xl transition"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden
            >
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
            </svg>
            <span className="leading-none">還書</span>
          </button>
        </div>

        <Link
          href="/books"
          className="mt-8 inline-flex w-full items-center justify-center gap-2 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium px-4 py-4 rounded-2xl transition"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3.5" y1="6" x2="3.51" y2="6" />
            <line x1="3.5" y1="12" x2="3.51" y2="12" />
            <line x1="3.5" y1="18" x2="3.51" y2="18" />
          </svg>
          <span className="leading-none">書籍清單</span>
        </Link>
      </div>

      <MemberPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onSelect}
        title={target === "borrow" ? "你是誰？（借書）" : "你是誰？（還書）"}
      />

      <div className="fixed bottom-4 inset-x-0 flex justify-center">
        <div className="px-4 py-2 rounded-full bg-white/80 backdrop-blur-md border border-neutral-200 text-neutral-700 text-xs flex items-center gap-2">
          <span>{orgName} 使用</span>
          <span className="text-neutral-300">·</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-neutral-500 hover:text-neutral-900 transition"
            >
              登出
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
