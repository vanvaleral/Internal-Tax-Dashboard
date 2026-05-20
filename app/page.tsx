import { AppShell } from "@/components/shell/app-shell";
import { StatusColumn } from "@/components/board/status-column";
import { Topbar } from "@/components/layout/topbar";
import { getBoardTasks } from "@/lib/data";
import { TASK_STATUSES } from "@/lib/types";

export default async function BoardPage() {
  const tasks = await getBoardTasks();

  return (
    <AppShell currentPath="/">
      <Topbar
        title="Recurring Tax Board"
        subtitle="Board grouped by workflow status so bottlenecks, revisions, and client delays are visible immediately. Every update stays inside the card."
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-[28px] border border-line/70 bg-white/80 p-5 shadow-panel lg:col-span-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">MVP scope</p>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-ink">Tax Team first, accounting support minimal</h3>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-accentSoft px-3 py-2 font-medium text-accent">Auto-generated monthly tasks</span>
              <span className="rounded-full bg-warningSoft px-3 py-2 font-medium text-warning">Follow-up burden visible</span>
              <span className="rounded-full bg-dangerSoft px-3 py-2 font-medium text-danger">Revisions never disappear</span>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-4">
          {TASK_STATUSES.map((status) => (
            <StatusColumn key={status} status={status} tasks={tasks.filter((task) => task.status === status)} />
          ))}
        </div>
      </section>
    </AppShell>
  );
}
