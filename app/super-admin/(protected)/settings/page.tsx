import Link from "next/link";
import SuperAdminShell from "@/components/SuperAdminShell";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAppSettings } from "@/lib/plans";
import { fetchVisionModels } from "@/lib/anthropic-models";
import TrialDaysForm from "./TrialDaysForm";
import BillingEnabledForm from "./BillingEnabledForm";
import AiModelsForm from "./AiModelsForm";

export const dynamic = "force-dynamic";

export default async function SuperAdminSettingsPage() {
  const provider = process.env.BILLING_PROVIDER ?? "instant";

  const admin = createAdminClient();
  // 兩個查詢互相獨立，並行縮短設定頁初始載入時間（Anthropic 模型 API 偶爾較慢）。
  const [
    {
      trialDays,
      billingEnabled,
      aiRecognizeModelPrimary,
      aiRecognizeModelFallback,
    },
    visionModels,
  ] = await Promise.all([
    loadAppSettings(admin, { bypassCache: true }),
    fetchVisionModels(),
  ]);

  return (
    <SuperAdminShell>
      <div className="space-y-10">
        <header>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
            營運設定
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            全域開關與系統狀態。體驗天數可線上調整，其餘需改 env 並重新部署。
          </p>
        </header>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-medium text-neutral-900">預設體驗天數</h2>
          <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
            新單位註冊時，會自動設定體驗截止日為「註冊日 + N 天」。
            只影響「之後新註冊的單位」；既有單位請改用單位列表上的「延長體驗」。
          </p>
          <div className="mt-4">
            <TrialDaysForm initialDays={trialDays} />
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-medium text-neutral-900">智能辨識模型</h2>
          <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
            拍照書封辨識使用的 Claude 模型。每月 500 次配額共用，不分模型。
            主要模型 fetch 失敗或 Anthropic 回非 2xx 時，自動改用備用模型一次；
            「無法識別」這種品質失敗不會觸發 fallback。
            模型 ID 採 Anthropic 官方格式（4.6 起為無日期版本，如{" "}
            <code>claude-opus-4-7</code>），完整清單見{" "}
            <a
              href="https://docs.anthropic.com/en/docs/about-claude/models/all-models"
              target="_blank"
              rel="noreferrer"
              className="text-neutral-900 underline underline-offset-2 hover:no-underline"
            >
              Anthropic 文件
            </a>
            。儲存後 60 秒內快取失效，無需重新部署。
          </p>
          <div className="mt-4">
            <AiModelsForm
              initialPrimary={aiRecognizeModelPrimary}
              initialFallback={aiRecognizeModelFallback ?? ""}
              models={visionModels}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-medium text-neutral-900">方案與金流</h2>
          <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
            目前付費月費由{" "}
            <Link
              href="/super-admin/plans"
              className="text-neutral-900 underline underline-offset-2 hover:no-underline"
            >
              方案設定
            </Link>{" "}
            管理。金流商由 <code>BILLING_PROVIDER</code> env 決定（
            <code>{provider}</code>）；<code>instant</code>{" "}
            代表內部測試金流，按下訂閱即刻啟用、不會實際扣款。上線真實金流時請改成 <code>ecpay</code>{" "}
            / <code>jkopay</code> 並重新部署。
          </p>
          <div className="mt-4">
            <BillingEnabledForm initialEnabled={billingEnabled} />
          </div>
        </section>
      </div>
    </SuperAdminShell>
  );
}
