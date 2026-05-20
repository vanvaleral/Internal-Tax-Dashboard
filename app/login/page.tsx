import Link from "next/link";

import { AppShell } from "@/components/shell/app-shell";
import { Topbar } from "@/components/layout/topbar";

export default function LoginPage() {
  return (
    <AppShell currentPath="/login">
      <Topbar
        title="Supabase Authentication"
        subtitle="MVP authentication is intentionally lightweight: staff sign in with email so the board stays controlled without adding operational friction."
      />

      <section className="mx-auto w-full max-w-xl rounded-[28px] border border-line/70 bg-white/85 p-6 shadow-panel">
        <h3 className="text-xl font-bold text-ink">Email sign-in setup</h3>
        <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
          <li>1. Enable Email or Magic Link authentication in Supabase.</li>
          <li>2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel.</li>
          <li>3. Restrict user creation to internal staff only.</li>
          <li>4. Map authenticated users to `staff_profiles` for PIC visibility and workload reporting.</li>
        </ol>
        <div className="mt-6 rounded-2xl bg-canvas p-4 text-sm text-slate-700">
          Authentication wiring is prepared in the project structure so you can connect a real session flow without changing the core board or dashboard data model.
        </div>
        <Link href="/" className="mt-6 inline-flex rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-white">
          Return to board
        </Link>
      </section>
    </AppShell>
  );
}
