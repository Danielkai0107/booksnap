import Link from "next/link";
import { notFound } from "next/navigation";
import SuperAdminShell from "@/components/SuperAdminShell";
import {
  getOrgBorrowerDetail,
  getOrganizationOrNull,
} from "@/lib/super-admin/org-data";
import { maskPhoneAdmin } from "@/lib/mask";

type Params = Promise<{ orgId: string; borrowerId: string }>;

export default async function SuperAdminBorrowerDetailPage({
  params,
}: {
  params: Params;
}) {
  const { orgId, borrowerId } = await params;
  const org = await getOrganizationOrNull(orgId);
  if (!org) notFound();

  const data = await getOrgBorrowerDetail(orgId, borrowerId);
  if (!data) notFound();

  const { borrower, holding, records, books } = data;
  const returnedRecords = records.filter((r) => r.returned_at);
  const orgBase = `/super-admin/organizations/${orgId}`;

  return (
    <SuperAdminShell
      backHref={`${orgBase}?tab=borrowers`}
      topbarTitle={borrower.display_name}
      contentWidth="wide"
    >
      <p className="text-xs text-neutral-500 mb-4">
        <Link href={orgBase} className="hover:underline">
          {org.name}
        </Link>
        <span className="mx-1">/</span>
        <span>出借人詳情（唯讀）</span>
      </p>

      <div className="md:grid md:grid-cols-[340px_1fr] md:gap-6 md:items-start">
        <section className="bg-neutral-100 border border-neutral-200 rounded-2xl p-5 md:p-7 mb-6 md:mb-0 md:sticky md:top-20">
          <h1 className="text-xl font-semibold text-neutral-900">
            {borrower.display_name}
          </h1>
          <dl className="mt-3 grid grid-cols-[64px_1fr] gap-y-1.5 text-sm">
            <dt className="text-neutral-400">手機</dt>
            <dd className="text-neutral-900 font-mono">
              {maskPhoneAdmin(borrower.phone)}
            </dd>
            {borrower.email && (
              <>
                <dt className="text-neutral-400">Email</dt>
                <dd className="text-neutral-900 break-all">{borrower.email}</dd>
              </>
            )}
            <dt className="text-neutral-400">加入</dt>
            <dd className="text-neutral-700 tabular-nums">
              {new Date(borrower.created_at).toLocaleString("zh-TW")}
            </dd>
            {borrower.last_active_at && (
              <>
                <dt className="text-neutral-400">最近</dt>
                <dd className="text-neutral-700 tabular-nums">
                  {new Date(borrower.last_active_at).toLocaleString("zh-TW")}
                </dd>
              </>
            )}
          </dl>
        </section>

        <div className="md:min-w-0 space-y-6">
          <HoldingSection holding={holding} orgBase={orgBase} />
          <RecordBlock
            title={`出借紀錄 (${records.length})`}
            records={records}
            timeKey="borrowed_at"
            timeLabel="借出"
            books={books}
            orgBase={orgBase}
            empty="尚無出借紀錄"
          />
          <RecordBlock
            title={`歸還紀錄 (${returnedRecords.length})`}
            records={returnedRecords}
            timeKey="returned_at"
            timeLabel="歸還"
            books={books}
            orgBase={orgBase}
            empty="尚無歸還紀錄"
          />
        </div>
      </div>
    </SuperAdminShell>
  );
}

function HoldingSection({
  holding,
  orgBase,
}: {
  holding: Array<{
    book_id: string;
    title: string;
    image_url: string | null;
    current_location: string | null;
  }>;
  orgBase: string;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-900 mb-3">
        持有中 ({holding.length})
      </h2>
      {holding.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          目前沒有出借中的書
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {holding.map((b) => (
            <li key={b.book_id} className="py-3">
              <Link
                href={`${orgBase}/books/${encodeURIComponent(b.book_id)}`}
                className="flex items-start gap-3 hover:opacity-80"
              >
                {b.image_url ? (
                  <img
                    src={b.image_url}
                    alt={b.title}
                    className="w-12 h-16 object-cover rounded border border-neutral-200 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-16 bg-neutral-100 rounded shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 truncate">
                    {b.title}
                  </p>
                  <p className="text-xs text-neutral-400 font-mono mt-0.5">
                    {b.book_id}
                  </p>
                  {b.current_location && (
                    <p className="text-xs text-neutral-500 mt-0.5 truncate">
                      使用地點 · {b.current_location}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecordBlock({
  title,
  records,
  timeKey,
  timeLabel,
  books,
  orgBase,
  empty,
}: {
  title: string;
  records: Array<{
    id: string;
    book_id: string;
    borrowed_at: string;
    returned_at: string | null;
    location_note: string | null;
  }>;
  timeKey: "borrowed_at" | "returned_at";
  timeLabel: string;
  books: Record<string, { book_id: string; title: string }>;
  orgBase: string;
  empty: string;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-900 mb-3">{title}</h2>
      {records.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {records.map((r) => {
            const t = r[timeKey];
            const book = books[r.book_id];
            return (
              <li
                key={r.id}
                className="px-4 py-3 bg-neutral-100 rounded-xl flex items-center justify-between gap-3"
              >
                <Link
                  href={`${orgBase}/books/${encodeURIComponent(r.book_id)}`}
                  className="text-sm font-medium text-neutral-900 hover:underline truncate min-w-0"
                >
                  {book?.title ?? r.book_id}
                </Link>
                <div className="text-xs text-neutral-500 tabular-nums text-right shrink-0"><span className="text-neutral-400">{timeLabel} </span>{t ? new Date(t).toLocaleString("zh-TW") : "—"}</div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
