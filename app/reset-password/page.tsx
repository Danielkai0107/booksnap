import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordForm from "./ResetPasswordForm";

type Search = Promise<{ email?: string }>;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  // Link mode: callback already exchanged the code → user is signed in.
  // OTP fallback mode: no session yet, the form will collect email + token.
  const hasSession = Boolean(data.user);

  return (
    <main className="min-h-screen flex flex-col px-6 sm:px-10 pt-20 md:pt-0 md:items-center md:justify-center bg-white">
      <div className="w-full max-w-sm mx-auto pb-32 md:pb-0">
        <h1 className="text-center text-3xl font-semibold tracking-tight text-neutral-900">
          booksnap
        </h1>
        <p className="mt-5 text-center text-sm text-neutral-400 tracking-wide">
          重設密碼
        </p>

        <ResetPasswordForm
          hasSession={hasSession}
          prefilledEmail={sp.email}
          variant="unit"
        />

        <p className="mt-6 text-center text-sm text-neutral-500">
          <Link
            href="/login"
            className="text-neutral-900 font-medium hover:underline"
          >
            返回登入
          </Link>
        </p>
      </div>
    </main>
  );
}
