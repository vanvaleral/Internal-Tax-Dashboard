import Link from "next/link";
import { CalendarClock, DatabaseZap } from "lucide-react";

export function Topbar({
  title,
  subtitle
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="rounded-[28px] border border-line/70 bg-white/85 p-5 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Internal Workflow</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-canvas px-3 py-2 text-sm text-slate-600">
            <CalendarClock className="h-4 w-4 text-accent" />
            Monthly obligations auto-generated
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-white"
          >
            <DatabaseZap className="h-4 w-4" />
            KPI foundation
          </Link>
        </div>
      </div>
    </header>
  );
}
