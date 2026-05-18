type Props = {
  aiUsed: number;
  periodStart: string;
  periodEnd: string;
  bookCount: number;
  borrowerCount: number;
  reportCount: number;
};

export default function OrgDetailStats({
  aiUsed,
  periodStart,
  periodEnd,
  bookCount,
  borrowerCount,
  reportCount,
}: Props) {
  const periodStartLabel = new Date(periodStart).toLocaleDateString("zh-TW");
  const periodEndLabel = new Date(periodEnd).toLocaleDateString("zh-TW");

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
