import Link from "next/link";
import { notFound } from "next/navigation";
import SuperAdminShell from "@/components/SuperAdminShell";
import { getOrgBookDetail, getOrganizationOrNull } from "@/lib/super-admin/org-data";
import { maskPhoneAdmin } from "@/lib/mask";

type Params = Promise<{ orgId: string; bookId: string }>;

export default async function SuperAdminBookDetailPage({
  params,
}: {
  params: Params;
}) {
  const { orgId, bookId } = await params;
  const org = await getOrganizationOrNull(orgId);
  if (!org) notFound();

  const data = await getOrgBookDetail(orgId, decodeURIComponent(bookId));
  if (!data) notFound();

  const { book, records, categories } = data;
  const categoryName = book.category_id
    ? categories.find((c) => c.id === book.category_id)?.name
    : null;
  const returnedRecords = records.filter((r) => r.returned_at);
  const orgBase = `/super-admin/organizations/${orgId}`;

  return (
    <SuperAdminShell
      backHref={`${orgBase}?tab=books`}
      topbarTitle={book.title}
      contentWidth="wide"
    >
      <p className="text-xs text-neutral-500 mb-4">
        <Link href={orgBase} className="hover:underline">
          {org.name}
        </Link>
        <span className="mx-1">/</span>
        <span>書籍詳情（唯讀）</span>
      </p>

      <div className="md:grid md:grid-cols-[360px_1fr] md:gap-6 md:items-start">
        <section className="bg-neutral-100 border border-neutral-200 rounded-2xl p-5 md:p-7 mb-6 md:mb-0 md:sticky md:top-20">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <BookStatus status={book.status} />
            {categoryName && (
              <span className="inline-flex items-center h-[26px] text-xs px-2.5 rounded-full bg-white text-neutral-700 border border-neutral-200">
                {categoryName}
              </span>
            )}
            {book.shelf_id && (
              <span className="inline-flex items-center h-[26px] text-xs px-2.5 rounded-full bg-white text-neutral-700 border border-neutral-200">
                書架 {book.shelf_id}
              </span>
            )}
          </div>
          <h1 className="text-xl font-semibold text-neutral-900 leading-snug mb-4">
            {book.title}
          </h1>
          <div className="flex gap-4">
            {book.image_url ? (
              <img
                src={book.image_url}
                alt={book.title}
                className="w-24 h-32 object-cover rounded-lg border border-neutral-200 shrink-0"
              />
            ) : (
              <div className="w-24 h-32 rounded-lg bg-white border border-neutral-200 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-neutral-400 font-mono">{book.book_id}</p>
              <p className="mt-2 text-xs text-neutral-500">入庫 · {book.admin_name}</p>
              <p className="text-xs text-neutral-500 tabular-nums mt-1">
                {new Date(book.checkin_time).toLocaleString("zh-TW")}
              </p>
              {book.current_holder && (
                <p className="mt-3 text-sm text-neutral-600">
                  目前持有者：
                  {book.current_holder_id ? (
                    <Link
                      href={`${orgBase}/borrowers/${book.current_holder_id}`}
                      className="font-medium text-neutral-900 hover:underline ml-1"
                    >
                      {book.current_holder}
                    </Link>
                  ) : (
                    <span className="font-medium text-neutral-900 ml-1">
                      {book.current_holder}
                    </span>
                  )}
                  {book.current_location && (
                    <span className="ml-2 text-xs text-neutral-500">
                      @ {book.current_location}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          <BookMeta book={book} />
        </section>

        <div className="md:min-w-0 space-y-6">
          <RecordSection
            title={`出借紀錄 (${records.length})`}
            records={records}
            timeKey="borrowed_at"
            timeLabel="借出時間"
            orgBase={orgBase}
            empty="尚無出借紀錄"
          />
          <RecordSection
            title={`歸還紀錄 (${returnedRecords.length})`}
            records={returnedRecords}
            timeKey="returned_at"
            timeLabel="歸還時間"
            orgBase={orgBase}
            empty="尚無歸還紀錄"
          />
        </div>
      </div>
    </SuperAdminShell>
  );
}

function BookMeta({
  book,
}: {
  book: {
    isbn: string | null;
    authors: string | null;
    publisher: string | null;
    published_date: string | null;
  };
}) {
  const hasAny =
    book.isbn || book.authors || book.publisher || book.published_date;
  if (!hasAny) return null;
  return (
    <dl className="mt-5 pt-4 border-t border-neutral-200 grid grid-cols-[72px_1fr] gap-y-2 text-xs">
      {book.isbn && (
        <>
          <dt className="text-neutral-400">ISBN</dt>
          <dd className="text-neutral-900 font-mono break-all">{book.isbn}</dd>
        </>
      )}
      {book.authors && (
        <>
          <dt className="text-neutral-400">作者</dt>
          <dd className="text-neutral-900">{book.authors}</dd>
        </>
      )}
      {book.publisher && (
        <>
          <dt className="text-neutral-400">出版社</dt>
          <dd className="text-neutral-900">{book.publisher}</dd>
        </>
      )}
      {book.published_date && (
        <>
          <dt className="text-neutral-400">出版日期</dt>
          <dd className="text-neutral-900 tabular-nums">{book.published_date}</dd>
        </>
      )}
    </dl>
  );
}

type RecordItem = {
  id: string;
  borrower_id: string;
  borrowed_at: string;
  returned_at: string | null;
  location_note: string | null;
  borrower: { id: string; display_name: string; phone: string } | null;
};

function RecordSection({
  title,
  records,
  timeKey,
  timeLabel,
  orgBase,
  empty,
}: {
  title: string;
  records: RecordItem[];
  timeKey: "borrowed_at" | "returned_at";
  timeLabel: string;
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
            const name = r.borrower?.display_name ?? "（已移除）";
            return (
              <li
                key={r.id}
                className="px-4 py-3 flex items-start justify-between gap-3 bg-neutral-100 rounded-xl"
              >
                <div className="min-w-0">
                  {r.borrower ? (
                    <Link
                      href={`${orgBase}/borrowers/${r.borrower_id}`}
                      className="text-sm font-medium text-neutral-900 hover:underline"
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-neutral-900">
                      {name}
                    </span>
                  )}
                  {r.location_note && (
                    <p className="text-xs text-neutral-500 mt-1">
                      使用地點 · {r.location_note}
                    </p>
                  )}
                  {r.borrower?.phone && (
                    <p className="text-xs text-neutral-400 font-mono mt-0.5">
                      {maskPhoneAdmin(r.borrower.phone)}
                    </p>
                  )}
                </div>
                <div className="text-xs text-neutral-500 tabular-nums text-right shrink-0">
                  <span className="text-neutral-400">{timeLabel} </span>
                  {t ? new Date(t).toLocaleString("zh-TW") : "—"}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BookStatus({ status }: { status: string }) {
  if (status === "available") {
    return (
      <span className="inline-flex text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
        可借
      </span>
    );
  }
  return (
    <span className="inline-flex text-xs px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200 font-medium">
      已借出
    </span>
  );
}
