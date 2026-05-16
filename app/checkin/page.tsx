"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CloseButton from "@/components/CloseButton";
import MemberPicker from "@/components/MemberPicker";

export default function CheckinEntryPage() {
  const router = useRouter();
  const [open, setOpen] = useState(true);

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
            請先選擇本次負責入庫的成員
          </p>
        </div>
      </section>

      <MemberPicker
        open={open}
        onClose={() => {
          setOpen(false);
          router.replace("/admin");
        }}
        onSelect={(name) => {
          sessionStorage.setItem("adminName", name);
          router.push("/checkin/scan");
        }}
        title="負責入庫的人是？"
        subtitle="此名稱會記錄為本次入庫的負責人"
      />
    </main>
  );
}
