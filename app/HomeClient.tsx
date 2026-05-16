"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MemberPicker from "@/components/MemberPicker";
import { useToast } from "@/components/ToastProvider";
import { signOutAction } from "./auth/actions";

type Props = {
  orgName: string;
  aiRecognizeCount: number;
};

export default function HomeClient({ orgName, aiRecognizeCount }: Props) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState<"borrow" | "return" | null>(null);
  const [navigating, setNavigating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    router.prefetch("/borrow/scan");
    router.prefetch("/return/scan");
    router.prefetch("/members");
    router.prefetch("/books");
    router.prefetch("/admin");
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem("pendingToast");
    if (!stored) return;
    sessionStorage.removeItem("pendingToast");
    try {
      const parsed = JSON.parse(stored) as {
        message?: string;
        kind?: "success" | "error" | "info";
      };
      if (parsed.message) {
        toast.show(parsed.message, parsed.kind ?? "success");
      }
    } catch {
      // ignore malformed payload
    }
  }, [toast]);

  function openPicker(t: "borrow" | "return") {
    setTarget(t);
    setPickerOpen(true);
  }

  function onSelect(name: string) {
    if (!target) return;
    sessionStorage.setItem("currentMember", name);
    setPickerOpen(false);
    setNavigating(true);
    router.push(target === "borrow" ? "/borrow/scan" : "/return/scan");
  }

  function handleNavigate(href: string) {
    setNavigating(true);
    router.push(href);
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6 sm:px-10">
      <div
        className="fixed top-4 inset-x-0 px-4 flex items-center justify-end gap-3 pointer-events-none"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="pointer-events-auto h-9 px-4 rounded-full bg-white/80 backdrop-blur-md border border-neutral-200 text-neutral-700 text-xs inline-flex items-center gap-2 min-w-0">
          <span className="truncate max-w-[40vw]">{orgName}</span>
          <span className="text-neutral-300 shrink-0">·</span>
          <form action={signOutAction} className="shrink-0 flex">
            <button
              type="submit"
              className="text-neutral-500 hover:text-neutral-900 transition"
            >
              登出
            </button>
          </form>
        </div>
      </div>

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

        <div className="mt-8 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleNavigate("/members")}
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
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="leading-none">成員查詢</span>
          </button>
          <button
            type="button"
            onClick={() => handleNavigate("/books")}
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
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3.5" y1="6" x2="3.51" y2="6" />
              <line x1="3.5" y1="12" x2="3.51" y2="12" />
              <line x1="3.5" y1="18" x2="3.51" y2="18" />
            </svg>
            <span className="leading-none">書籍查詢</span>
          </button>
        </div>
      </div>

      <MemberPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onSelect}
        title={target === "borrow" ? "你是誰？（借書）" : "你是誰？（還書）"}
      />

      {navigating && (
        <div className="fixed inset-0 z-[60] bg-white flex items-center justify-center">
          <div className="w-9 h-9 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
        </div>
      )}

      <div
        className="fixed bottom-4 inset-x-0 px-4 flex items-center justify-between gap-3 pointer-events-none"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <button
          type="button"
          onClick={() => handleNavigate("/admin")}
          className="pointer-events-auto h-9 px-4 rounded-full bg-white/80 backdrop-blur-md border border-neutral-200 text-neutral-700 text-xs font-normal hover:bg-white/95 hover:text-neutral-900 transition inline-flex items-center gap-1.5"
        >
          <span>管理後台</span>
        </button>

        <div className="pointer-events-auto h-9 px-4 rounded-full bg-white/80 backdrop-blur-md border border-neutral-200 text-neutral-700 text-xs inline-flex items-center gap-1.5">
          <span>智能 AI 辨識次數</span>
          <span className="font-semibold tabular-nums text-neutral-900">
            {aiRecognizeCount.toLocaleString()}
          </span>
          <span>次</span>
        </div>
      </div>
    </main>
  );
}
