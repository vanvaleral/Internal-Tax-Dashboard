import { AppShell } from "@/components/shell/app-shell";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Topbar } from "@/components/layout/topbar";
import { getDashboardStats } from "@/lib/data";
import { formatPeriod } from "@/lib/utils";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <AppShell currentPath="/dashboard">
      <Topbar
        title="Management Dashboard"
        subtitle="A lightweight control layer for revisions, client responsiveness, workload distribution, and upcoming obligations without turning the app into a surveillance tool."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Revision Tasks" value={stats.revisionTasks.length} tone="alert" />
        <MetricCard label="Awaiting Client Data" value={stats.stuckTasks.length} />
        <MetricCard label="Temporary Pending Revision" value={stats.temporaryPending.length} tone="alert" />
        <MetricCard label="Upcoming Obligations" value={stats.upcomingTasks.length} tone="success" />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-[28px] border border-line/70 bg-white/85 p-5 shadow-panel xl:col-span-2">
          <h3 className="text-lg font-bold text-ink">Tasks requiring revision</h3>
          <div className="mt-4 space-y-3">
            {stats.revisionTasks.map((task) => (
              <div key={task.id} className="rounded-2xl border border-line bg-canvas p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-ink">{task.clientName}</p>
                    <p className="text-sm text-slate-600">
                      {task.taxType} / {formatPeriod(task.periodMonth, task.periodYear)} / {task.assignedPic}
                    </p>
                  </div>
                  <span className="rounded-full bg-dangerSoft px-3 py-1 text-xs font-semibold text-danger">
                    {task.status}
                  </span>
                </div>
                {task.revisionReason ? (
                  <p className="mt-3 text-sm leading-6 text-slate-700">{task.revisionReason}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-line/70 bg-white/85 p-5 shadow-panel">
          <h3 className="text-lg font-bold text-ink">Highest follow-up clients</h3>
          <div className="mt-4 space-y-3">
            {stats.highFollowUpClients.map((client) => (
              <div key={client.clientId} className="flex items-center justify-between rounded-2xl bg-canvas px-4 py-3">
                <div>
                  <p className="font-semibold text-ink">{client.clientName}</p>
                  <p className="text-sm text-slate-500">Escalation visibility</p>
                </div>
                <span className="rounded-full bg-warningSoft px-3 py-1 text-sm font-semibold text-warning">
                  {client.totalFollowUps}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-[28px] border border-line/70 bg-white/85 p-5 shadow-panel">
          <h3 className="text-lg font-bold text-ink">Upcoming obligations</h3>
          <div className="mt-4 space-y-3">
            {stats.upcomingTasks.map((task) => (
              <div key={task.id} className="rounded-2xl bg-canvas px-4 py-3">
                <p className="font-semibold text-ink">{task.clientName}</p>
                <p className="text-sm text-slate-600">
                  {task.taxType} / Due {task.dueDate}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-line/70 bg-white/85 p-5 shadow-panel">
          <h3 className="text-lg font-bold text-ink">Workload by PIC</h3>
          <div className="mt-4 space-y-3">
            {stats.workloadByPic.map((item) => (
              <div key={item.assignedPic} className="rounded-2xl bg-canvas px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-ink">{item.assignedPic}</p>
                  <span className="text-sm text-slate-500">{item.openTasks} open</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.revisions} currently in revision flow</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-line/70 bg-white/85 p-5 shadow-panel">
          <h3 className="text-lg font-bold text-ink">Revision frequency by tax type</h3>
          <div className="mt-4 space-y-3">
            {stats.revisionFrequency.map((item) => (
              <div key={item.taxType} className="flex items-center justify-between rounded-2xl bg-canvas px-4 py-3">
                <p className="font-semibold text-ink">{item.taxType}</p>
                <span className="rounded-full bg-dangerSoft px-3 py-1 text-sm font-semibold text-danger">
                  {item.revisionCount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
