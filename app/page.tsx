"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import MemberPicker from "@/components/MemberPicker";

export default function HomePage() {
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
    <main className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-30 w-full bg-white/55 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 sm:px-10 h-14 flex items-center justify-center relative">
          <span className="text-base font-semibold tracking-tight text-neutral-900">
            booksnap
          </span>
        </div>
      </nav>

      <section className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10">
        <div className="w-full max-w-md mx-auto text-center -mt-10">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-neutral-900 leading-[1.15]">
            想做什麼？
          </h1>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => openPicker("borrow")}
              className="inline-flex items-center justify-center bg-neutral-900 hover:bg-neutral-800 text-white text-base font-medium px-6 py-5 rounded-xl transition"
            >
              借書
            </button>
            <button
              type="button"
              onClick={() => openPicker("return")}
              className="inline-flex items-center justify-center bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-base font-medium px-6 py-5 rounded-xl transition"
            >
              還書
            </button>
          </div>
        </div>
      </section>

      <MemberPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onSelect}
        title={target === "borrow" ? "你是誰？（借書）" : "你是誰？（還書）"}
      />
    </main>
  );
}
