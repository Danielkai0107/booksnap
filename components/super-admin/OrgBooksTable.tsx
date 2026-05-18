import Link from "next/link";
import type { BookRow } from "@/lib/supabase/types";

export default function OrgBooksTable({
  orgId,
  books,
}: {
  orgId: string;
  books: BookRow[];
}) {
  if (books.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">尚無館藏</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-neutral-400 border-b border-neutral-100">
            <th className="pb-2 pr-3 font-medium">書名</th>
            <th className="pb-2 pr-3 font-medium hidden sm:table-cell">編號</th>
            <th className="pb-2 pr-3 font-medium">狀態</th>
            <th className="pb-2 pr-3 font-medium hidden md:table-cell">入庫人員</th>
            <th className="pb-2 font-medium hidden lg:table-cell">入庫時間</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {books.map((b) => (
            <tr key={b.book_id} className="group">
              <td className="py-3 pr-3">
                <Link
                  href={`/super-admin/organizations/${orgId}/books/${encodeURIComponent(b.book_id)}`}
                  className="font-medium text-neutral-900 hover:underline line-clamp-2"
                >
                  {b.title}
                </Link>
              </td>
              <td className="py-3 pr-3 font-mono text-xs text-neutral-500 hidden sm:table-cell">
                {b.book_id}
              </td>
              <td className="py-3 pr-3">
                <BookStatus status={b.status} />
              </td>
              <td className="py-3 pr-3 text-neutral-600 hidden md:table-cell">
                {b.admin_name}
              </td>
              <td className="py-3 text-neutral-500 tabular-nums text-xs hidden lg:table-cell">
                {new Date(b.checkin_time).toLocaleString("zh-TW")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BookStatus({ status }: { status: string }) {
  if (status === "available") {
    return (
      <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
        可借
      </span>
    );
  }
  return (
    <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
      已借出
    </span>
  );
}
