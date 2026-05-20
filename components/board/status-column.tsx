import { type BoardTask, type TaskStatus } from "@/lib/types";
import { cn, formatPeriod, statusTone } from "@/lib/utils";
import { decrementFollowUp, incrementFollowUp, moveTask, saveReceipt } from "@/app/actions";

function quickActions(currentStatus: TaskStatus): TaskStatus[] {
  switch (currentStatus) {
    case "Awaiting Client Data":
      return ["Ready to Process", "Submitted Temporary"];
    case "Ready to Process":
      return ["Submitted Temporary", "Revised & Finalized"];
    case "Submitted Temporary":
      return ["Waiting Revision Data", "Revised & Finalized"];
    case "Waiting Revision Data":
      return ["Ready to Process", "Revised & Finalized"];
    case "Revised & Finalized":
      return ["Archived"];
    case "Archived":
      return ["Ready to Process"];
  }
}

function urgencyLabel(task: BoardTask) {
  if (task.status === "Waiting Revision Data" || task.followUpCount >= 4) {
    return "Needs attention";
  }

  if (task.isOverdue) {
    return "Overdue";
  }

  return "On track";
}

export function StatusColumn({
  status,
  tasks
}: {
  status: TaskStatus;
  tasks: BoardTask[];
}) {
  return (
    <section className="flex min-w-[320px] max-w-[360px] flex-1 flex-col rounded-[28px] border border-line/70 bg-white/75 p-4 shadow-panel backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-600">{status}</h3>
          <p className="mt-1 text-sm text-slate-500">{tasks.length} tasks</p>
        </div>
        <div className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusTone(status))}>{tasks.length}</div>
      </div>

      <div className="space-y-4">
        {tasks.map((task) => (
          <article key={task.id} className="rounded-[24px] border border-line/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-ink">{task.clientName}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {task.taxType} / {formatPeriod(task.periodMonth, task.periodYear)}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  task.isOverdue ? "bg-dangerSoft text-danger" : "bg-accentSoft text-accent"
                )}
              >
                {urgencyLabel(task)}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600">
              <div className="rounded-2xl bg-canvas px-3 py-2">
                <span className="block text-[11px] uppercase tracking-[0.14em] text-slate-400">PIC</span>
                <span className="mt-1 block font-medium text-ink">{task.assignedPic}</span>
              </div>
              <div className="rounded-2xl bg-canvas px-3 py-2">
                <span className="block text-[11px] uppercase tracking-[0.14em] text-slate-400">Follow-ups</span>
                <span className="mt-1 block font-medium text-ink">{task.followUpCount}</span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {task.revisionRequired ? (
                <span className="rounded-full bg-dangerSoft px-2.5 py-1 text-xs font-semibold text-danger">
                  Revision required
                </span>
              ) : null}
              {task.receiptNumber ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  Receipt: {task.receiptNumber}
                </span>
              ) : null}
            </div>

            {task.revisionReason ? (
              <p className="mt-3 rounded-2xl bg-dangerSoft/50 px-3 py-2 text-sm leading-6 text-slate-700">
                {task.revisionReason}
              </p>
            ) : null}

            <div className="mt-4 flex items-center gap-2">
              <form action={incrementFollowUp}>
                <input type="hidden" name="taskId" value={task.id} />
                <button className="rounded-xl border border-line px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  + Follow Up
                </button>
              </form>
              <form action={decrementFollowUp}>
                <input type="hidden" name="taskId" value={task.id} />
                <button className="rounded-xl border border-line px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  - Follow Up
                </button>
              </form>
            </div>

            <form action={saveReceipt} className="mt-3 flex gap-2">
              <input type="hidden" name="taskId" value={task.id} />
              <input
                type="text"
                name="receiptNumber"
                defaultValue={task.receiptNumber ?? ""}
                placeholder="Receipt number"
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm outline-none ring-0 placeholder:text-slate-400"
              />
              <button className="rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white">Save</button>
            </form>

            <div className="mt-3 flex flex-wrap gap-2">
              {quickActions(task.status).map((nextStatus) => (
                <form key={`${task.id}-${nextStatus}`} action={moveTask}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <input type="hidden" name="status" value={nextStatus} />
                  <button className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">
                    Move to {nextStatus}
                  </button>
                </form>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
