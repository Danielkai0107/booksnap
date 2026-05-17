"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import OtpInput from "@/components/OtpInput";
import { useToast } from "@/components/ToastProvider";

type Factor = {
  id: string;
  status: "verified" | "unverified";
  friendly_name?: string | null;
};

type Stage =
  | { kind: "loading" }
  | { kind: "idle" }
  | { kind: "enrolling" }
  | {
      kind: "verifying";
      factorId: string;
      qrCode: string;
      secret: string;
    }
  | { kind: "enrolled"; factorId: string };

/**
 * Self-contained TOTP enroll / verify / unenroll panel. The server-side
 * page just renders this component — all MFA traffic goes through the
 * browser supabase client so cookies (and the resulting AAL bump) are
 * synced automatically without an extra round-trip through a server
 * action.
 *
 * Flow:
 *   1. On mount we list factors. The "verified totp" decides between
 *      `idle` (let the user enable) and `enrolled` (let them disable).
 *   2. Enabling: enroll → show QR + secret → user enters code → verify →
 *      `enrolled`.
 *   3. Disabling: unenroll the verified totp factor → `idle`.
 *
 * Stale unverified factors (e.g. user closed the tab mid-enroll) get
 * pruned at the start of every fresh enrollment so the UI never piles
 * up half-finished factors over time.
 */
export default function MfaSettings() {
  const supabase = useState(() => createClient())[0];
  const toast = useToast();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast.error(error.message);
      setStage({ kind: "idle" });
      return;
    }
    const factors = (data?.totp ?? []) as Factor[];
    const verified = factors.find((f) => f.status === "verified");
    if (verified) {
      setStage({ kind: "enrolled", factorId: verified.id });
    } else {
      setStage({ kind: "idle" });
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (!alive) return;
      if (error) {
        toast.error(error.message);
        setStage({ kind: "idle" });
        return;
      }
      const factors = (data?.totp ?? []) as Factor[];
      const verified = factors.find((f) => f.status === "verified");
      setStage(
        verified
          ? { kind: "enrolled", factorId: verified.id }
          : { kind: "idle" },
      );
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnroll() {
    setBusy(true);
    setStage({ kind: "enrolling" });
    try {
      // Clean up any leftover unverified factors so we don't pile up
      // dangling enrollments.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const stale =
        (existing?.totp ?? []).filter(
          (f) => (f as Factor).status === "unverified",
        ) as Factor[];
      for (const f of stale) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "booksnap",
      });
      if (error || !data) {
        toast.error(error?.message ?? "啟用失敗");
        setStage({ kind: "idle" });
        return;
      }
      setCode("");
      setStage({
        kind: "verifying",
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll() {
    if (stage.kind !== "verifying") return;
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error("請輸入 6 碼數字驗證碼");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: stage.factorId,
        code: code.trim(),
      });
      if (error) {
        toast.error("驗證碼錯誤或已過期，請重新嘗試");
        return;
      }
      toast.success("已啟用雙重驗證");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnroll() {
    if (stage.kind !== "verifying") return;
    setBusy(true);
    try {
      await supabase.auth.mfa.unenroll({ factorId: stage.factorId });
      setStage({ kind: "idle" });
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (stage.kind !== "enrolled") return;
    if (
      !window.confirm(
        "確定停用雙重驗證？停用後登入只需密碼，安全性會降低。",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: stage.factorId,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("已停用雙重驗證");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (stage.kind === "loading" || stage.kind === "enrolling") {
    return (
      <div className="py-12 flex justify-center">
        <div className="w-7 h-7 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (stage.kind === "verifying") {
    return (
      <section className="space-y-5 max-w-md">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">
            掃描 QR Code
          </h2>
          <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
            使用 Google Authenticator、1Password、Authy 等驗證 App 掃描下方 QR Code。
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-4 flex justify-center">
          {/* qr_code is already a data URI; <img> is fine here. */}
          <img
            src={stage.qrCode}
            alt="TOTP QR Code"
            width={200}
            height={200}
            className="block"
          />
        </div>

        <div>
          <p className="text-xs font-medium text-neutral-500 mb-1.5">
            無法掃描？輸入下列密鑰
          </p>
          <code className="block w-full px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200 text-xs font-mono break-all text-neutral-700">
            {stage.secret}
          </code>
        </div>

        <div>
          <label
            htmlFor="mfa-enroll-otp"
            className="block text-xs font-medium text-neutral-500 mb-1.5"
          >
            App 顯示的 6 碼驗證碼
          </label>
          <div className="flex justify-center">
            <OtpInput
              id="mfa-enroll-otp"
              value={code}
              onChange={setCode}
              length={6}
              maxLength={6}
              autoFocus
            />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={cancelEnroll}
            disabled={busy}
            className="flex-1 h-[44px] rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirmEnroll}
            disabled={busy}
            className="flex-1 h-[44px] rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium transition disabled:bg-neutral-400"
          >
            {busy ? "驗證中…" : "完成啟用"}
          </button>
        </div>
      </section>
    );
  }

  if (stage.kind === "enrolled") {
    return (
      <section className="space-y-5 max-w-md">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
          <p className="text-sm font-medium text-emerald-900">
            已啟用雙重驗證
          </p>
          <p className="mt-1.5 text-xs text-emerald-700 leading-relaxed">
            登入時會額外要求輸入驗證 App 中的 6 碼驗證碼。
          </p>
        </div>
        <button
          type="button"
          onClick={disable}
          disabled={busy}
          className="h-[44px] px-5 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition disabled:opacity-50"
        >
          {busy ? "處理中…" : "停用雙重驗證"}
        </button>
      </section>
    );
  }

  // idle
  return (
    <section className="space-y-5 max-w-md">
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
        <p className="text-sm font-medium text-neutral-900">
          雙重驗證（TOTP）
        </p>
        <p className="mt-1.5 text-xs text-neutral-600 leading-relaxed">
          在密碼之外，登入時再多一層驗證 App 動態驗證碼。即便密碼外洩，沒有您的設備也無法登入。
        </p>
      </div>
      <button
        type="button"
        onClick={startEnroll}
        disabled={busy}
        className="h-[44px] px-5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium transition disabled:bg-neutral-400"
      >
        {busy ? "啟用中…" : "啟用雙重驗證"}
      </button>
    </section>
  );
}
