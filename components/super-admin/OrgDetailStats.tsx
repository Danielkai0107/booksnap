type Props = {
  aiUsed: number;
  periodStart: string;
  periodEnd: string;
  bookCount: number;
  borrowerCount: number;
  reportCount: number;
  /**
   * 本期 OCR 用量計算的起點來源：
   *  - "subscription"：已訂閱，週期跟著 `subscription.current_period_start..end`
   *  - "trial"：未訂閱，週期錨點為 `org.approved_at`，每月按日翻頁
   * 用來在 UI 上明示「為什麼從這天開始算」，避免 super-admin 誤以為跨月累計。
   */
  periodSource?: "subscription" | "trial";
};

export default function OrgDetailStats({
  aiUsed,
  periodStart,
  periodEnd,
  bookCount,
  borrowerCount,
  reportCount,
  periodSource,
}: Props) {
  const periodStartLabel = new Date(periodStart).toLocaleDateString("zh-TW");
  const periodEndLabel = new Date(periodEnd).toLocaleDateString("zh-TW");
  const sourceTag =
    periodSource === "subscription"
      ? "依訂閱週期計算（每次訂閱／續期重新歸零）"
      : periodSource === "trial"
        ? "依體驗錨點計算（每月翻頁時歸零）"
        : null;

  return (
    <section className="bg-white border border-neutral-200 rounded-2xl p-5 md:p-6 w-full">
      <h2 className="text-xs font-medium text-neutral-500 mb-4">
        本期使用概況
      </h2>
      <div className="grid w-full grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="智能辨識"
          value={`${aiUsed.toLocaleString()} 次`}
          sub={`${periodStartLabel} ~ ${periodEndLabel}`}
        />
        <StatCard
          label="館藏冊數"
          value={`${bookCount.toLocaleString()} 冊`}
        />
        <StatCard
          label="出借人"
          value={`${borrowerCount.toLocaleString()} 人`}
        />
        <StatCard
          label="問題回報"
          value={`${reportCount.toLocaleString()} 則`}
        />
      </div>
      {sourceTag && (
        <p className="mt-3 text-[11px] text-neutral-400 leading-relaxed">
          {sourceTag}
        </p>
      )}
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-h-[88px] flex flex-col justify-center bg-neutral-50 border border-neutral-200 rounded-xl p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-neutral-900 tabular-nums">
        {value}
      </p>
      {sub && (
        <p className="mt-1.5 text-[11px] text-neutral-400 leading-snug">
          {sub}
        </p>
      )}
    </div>
  );
}
