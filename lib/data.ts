import { formatISO, isBefore } from "date-fns";

import { demoDashboard, demoTasks } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/server";
import type { BoardTask, DashboardStats, TaskStatus } from "@/lib/types";

function mapTask(row: Record<string, unknown>): BoardTask {
  const dueDate = String(row.due_date);

  return {
    id: String(row.id),
    clientId: String(row.client_id),
    clientName: String(row.client_name),
    teamDivision: row.team_division as BoardTask["teamDivision"],
    periodMonth: Number(row.period_month),
    periodYear: Number(row.period_year),
    taxType: row.tax_type as BoardTask["taxType"],
    assignedPic: String(row.assigned_pic),
    status: row.status as TaskStatus,
    submissionType: row.submission_type as BoardTask["submissionType"],
    receiptNumber: row.receipt_number ? String(row.receipt_number) : null,
    revisionRequired: Boolean(row.revision_required),
    revisionReason: row.revision_reason ? String(row.revision_reason) : null,
    followUpCount: Number(row.follow_up_count ?? 0),
    lastFollowUpAt: row.last_follow_up_at ? String(row.last_follow_up_at) : null,
    dueDate,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    isOverdue: Boolean(
      row.is_overdue ??
        (isBefore(new Date(dueDate), new Date()) &&
          !["Revised & Finalized", "Archived"].includes(String(row.status)))
    )
  };
}

export async function getBoardTasks() {
  const supabase = await createClient();

  if (!supabase) {
    return demoTasks;
  }

  const { data, error } = await supabase
    .from("compliance_board")
    .select("*")
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .order("due_date", { ascending: true });

  if (error || !data) {
    return demoTasks;
  }

  return data.map((row) => mapTask(row as Record<string, unknown>));
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const tasks = await getBoardTasks();

  const revisionTasks = tasks.filter((task) => task.revisionRequired);
  const highFollowUpClients = Object.values(
    tasks.reduce<Record<string, { clientId: string; clientName: string; totalFollowUps: number }>>(
      (accumulator, task) => {
        const current = accumulator[task.clientId] ?? {
          clientId: task.clientId,
          clientName: task.clientName,
          totalFollowUps: 0
        };

        current.totalFollowUps += task.followUpCount;
        accumulator[task.clientId] = current;

        return accumulator;
      },
      {}
    )
  )
    .sort((left, right) => right.totalFollowUps - left.totalFollowUps)
    .slice(0, 5);

  const stuckTasks = tasks.filter((task) => task.status === "Awaiting Client Data");
  const upcomingTasks = tasks
    .filter((task) => task.status !== "Archived")
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
    .slice(0, 6);

  const workloadByPic = Object.values(
    tasks.reduce<Record<string, { assignedPic: string; openTasks: number; revisions: number }>>(
      (accumulator, task) => {
        const current = accumulator[task.assignedPic] ?? {
          assignedPic: task.assignedPic,
          openTasks: 0,
          revisions: 0
        };

        if (!["Revised & Finalized", "Archived"].includes(task.status)) {
          current.openTasks += 1;
        }

        if (task.revisionRequired) {
          current.revisions += 1;
        }

        accumulator[task.assignedPic] = current;
        return accumulator;
      },
      {}
    )
  );

  const revisionFrequency = Object.values(
    tasks.reduce<Record<string, { taxType: string; revisionCount: number }>>((accumulator, task) => {
      const current = accumulator[task.taxType] ?? {
        taxType: task.taxType,
        revisionCount: 0
      };

      if (task.revisionRequired) {
        current.revisionCount += 1;
      }

      accumulator[task.taxType] = current;
      return accumulator;
    }, {})
  );

  const temporaryPending = tasks.filter((task) => task.status === "Submitted Temporary");

  if (!tasks.length) {
    return demoDashboard;
  }

  return {
    revisionTasks,
    highFollowUpClients,
    stuckTasks,
    upcomingTasks,
    workloadByPic,
    revisionFrequency,
    temporaryPending
  };
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const supabase = await createClient();

  if (!supabase) {
    return;
  }

  const payload: Record<string, unknown> = {
    status,
    completed_at: ["Revised & Finalized", "Archived"].includes(status) ? formatISO(new Date()) : null
  };

  if (status === "Submitted Temporary") {
    payload.submission_type = "temporary";
  }

  if (status === "Revised & Finalized") {
    payload.submission_type = "final";
    payload.revision_required = false;
  }

  await supabase.from("compliance_tasks").update(payload).eq("id", taskId);
}

export async function changeFollowUp(taskId: string, direction: "increment" | "decrement") {
  const supabase = await createClient();

  if (!supabase) {
    return;
  }

  await supabase.rpc("adjust_follow_up_count", {
    p_task_id: taskId,
    p_delta: direction === "increment" ? 1 : -1
  });
}

export async function updateReceiptNumber(taskId: string, receiptNumber: string) {
  const supabase = await createClient();

  if (!supabase) {
    return;
  }

  await supabase.from("compliance_tasks").update({ receipt_number: receiptNumber }).eq("id", taskId);
}
