import SuperAdminLoginForm from "./SuperAdminLoginForm";

export default function SuperAdminLoginPage() {
  return (
    <main className="min-h-screen flex flex-col px-6 sm:px-10 pt-20 md:pt-0 md:items-center md:justify-center bg-white">
      <div className="w-full max-w-sm mx-auto pb-32 md:pb-0">
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
