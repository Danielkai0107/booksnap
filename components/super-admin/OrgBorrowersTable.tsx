import Link from "next/link";
import type { BorrowerWithHolding } from "@/lib/super-admin/org-data";
import { maskPhoneAdmin } from "@/lib/mask";

export default function OrgBorrowersTable({
  orgId,
  borrowers,
}: {
  orgId: string;
  borrowers: BorrowerWithHolding[];
}) {
  if (borrowers.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">尚無出借人</p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
      {borrowers.map((b) => (
        <li key={b.id}>
          <Link
            href={`/super-admin/organizations/${orgId}/borrowers/${b.id}`}
            className="flex items-center justify-between gap-3 py-3.5 hover:bg-neutral-50 -mx-2 px-2 rounded-lg transition"
          >
            <div className="min-w-0">
              <p className="font-medium text-neutral-900">{b.display_name}</p>
              <p className="text-xs text-neutral-500 font-mono mt-0.5">
                {maskPhoneAdmin(b.phone)}
              </p>
            </div>
            <span className="text-xs text-neutral-500 shrink-0 tabular-nums">
              持有 {b.holding_count} 本
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
