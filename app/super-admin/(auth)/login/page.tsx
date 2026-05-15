import SuperAdminLoginForm from "./SuperAdminLoginForm";

export default function SuperAdminLoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-10 bg-white">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-neutral-900">
          booksnap · 營運後台
        </h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          超級管理員登入
        </p>

        <SuperAdminLoginForm />
      </div>
    </main>
  );
}
