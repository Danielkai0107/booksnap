"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CloseButton from "@/components/CloseButton";
import MemberPicker from "@/components/MemberPicker";

type Step = "pick" | "mode";

export default function CheckinEntryPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("pick");
  const [adminName, setAdminName] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(true);

  useEffect(() => {
    sessionStorage.removeItem("books");
  }, []);

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <CloseButton href="/admin" />
      <section className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900">
            開始入庫
          </h1>
          <p className="mt-3 text-sm text-neutral-500">
            {step === "pick"
              ? "請先選擇本次負責入庫的成員"
              : `負責人：${adminName} · 請選擇入庫方式`}
          </p>
        </div>

        {step === "mode" && (
          <div className="mt-10 w-full max-w-sm space-y-3">
            <button
              type="button"
              onClick={() => router.push("/checkin/scan")}
              className="w-full bg-neutral-900 hover:bg-neutral-800 text-white rounded-2xl px-5 py-5 text-left transition"
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M3 7h4l2-2h6l2 2h4v12H3V7z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx="12"
                      cy="13"
                      r="3.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold">拍封面</p>
                  <p className="text-xs text-white/70 mt-0.5">
                    AI 辨識書名，自動找 ISBN 候選
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => router.push("/checkin/scan-barcode")}
              className="w-full bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 rounded-2xl px-5 py-5 text-left transition"
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold">掃條碼</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    對準 ISBN 條碼，自動帶入書名與封面
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem("adminName");
                setAdminName("");
                setStep("pick");
                setPickerOpen(true);
              }}
              className="w-full text-xs text-neutral-400 hover:text-neutral-600 pt-2 transition"
            >
              重新選擇負責人
            </button>
          </div>
        )}
      </section>

      <MemberPicker
        open={pickerOpen && step === "pick"}
        onClose={() => {
          setPickerOpen(false);
          router.replace("/admin");
        }}
        onSelect={(name) => {
          sessionStorage.setItem("adminName", name);
          setAdminName(name);
          setPickerOpen(false);
          setStep("mode");
        }}
        title="負責入庫的人是？"
        subtitle="此名稱會記錄為本次入庫的負責人"
      />
    </main>
  );
}
