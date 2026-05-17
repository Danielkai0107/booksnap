import MfaSettings from "@/components/MfaSettings";

export const dynamic = "force-dynamic";

export default function SuperAdminSecurityPage() {
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
          資安設定
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          管理超級管理員帳號的雙重驗證。建議所有營運帳號都啟用，避免單一密碼外洩造成全站影響。
        </p>
      </header>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-medium text-neutral-900">雙重驗證</h2>
        <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
          啟用後，下次登入除了密碼，還需要輸入驗證 App 顯示的 6 碼驗證碼。
        </p>
        <div className="mt-5">
          <MfaSettings />
        </div>
      </section>
    </div>
  );
}
