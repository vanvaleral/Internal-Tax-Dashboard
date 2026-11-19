import { isLeadership, type CurrentActor } from "@/lib/access";
import type { createAdminClient } from "@/lib/supabase/admin";
import { taskSteps } from "@/lib/my-work-steps";
import { readAllPages } from "@/lib/read-all-pages";

export type TaskRow = {
  id: string;
  title: string;
  notes: string;
  steps: unknown[];
  reminder_at: string | null;
  due_date: string | null;
  repeat_rule: string;
  repeat_custom_date: string | null;
  repeat_parent_id: string | null;
  case_id: string | null;
  is_completed: boolean;
  completed_at: string | null;
  completed_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
  created_by_profile_id: string;
  staff_profiles?: { display_name?: string | null; full_name?: string | null } | null;
  completed_by_profile?: { display_name?: string | null; full_name?: string | null } | null;
  my_work_task_assignees?: Array<{ staff_profile_id: string; staff_profiles?: { display_name?: string | null; full_name?: string | null } | null }>;
};

function displayName(profile: { display_name?: string | null; full_name?: string | null }) {
  return profile.display_name || profile.full_name || "Unknown";
}

export function taskResponse(task: TaskRow, preference?: { favorite?: boolean | null; favorited_at?: string | null } | null) {
  return {
    id: task.id,
    version: task.updated_at,
    title: task.title,
    note: task.notes || "",
    steps: taskSteps(task.steps, task.id),
    reminder: task.reminder_at ? new Date(task.reminder_at).toISOString() : "",
    dueDate: task.due_date || "",
    repeatRule: task.repeat_rule || "none",
    repeatCustomDate: task.repeat_custom_date ? task.repeat_custom_date.slice(0, 16) : "",
    repeatParentId: task.repeat_parent_id || "",
    caseId: task.case_id || "",
    done: Boolean(task.is_completed),
    completedAt: task.completed_at ? new Date(task.completed_at).getTime() : 0,
    createdAt: new Date(task.created_at).getTime(),
    createdAtText: task.created_at,
    creatorName: displayName(task.staff_profiles || {}),
    completedByName: task.completed_by_profile_id ? displayName(task.completed_by_profile || {}) : "",
    assignees: (task.my_work_task_assignees || []).map((assignee) => displayName(assignee.staff_profiles || {})),
    favorite: Boolean(preference?.favorite),
    favoritedAt: preference?.favorited_at ? new Date(preference.favorited_at).getTime() : 0
  };
}

export const TASK_SELECT = "*, staff_profiles!my_work_tasks_created_by_profile_id_fkey(display_name, full_name), completed_by_profile:staff_profiles!my_work_tasks_completed_by_profile_id_fkey(display_name, full_name), my_work_task_assignees(staff_profile_id, staff_profiles(display_name, full_name))";
export function currentTaskMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}`;
}
export function taskReadScope(value: string | null = "all") {
  const scope = value || "all";
  if (!["all", "current", "archive-index"].includes(scope) && !/^\d{4}-(0[1-9]|1[0-2])$/.test(scope)) throw new Error("Choose a valid task period.");
  if (!isNaN(Number(scope.slice(0,4))) && /^\d/.test(scope) && (Number(scope.slice(0,4)) < 2000 || Number(scope.slice(0,4)) > 2100)) throw new Error("Choose a valid task period.");
  return scope;
}
function taskQuery(query: any, scope: string) {
  const currentStart = `${currentTaskMonth()}-01T00:00:00+08:00`;
  if (scope === "current") return query.or(`is_completed.eq.false,completed_at.gte.${currentStart},completed_at.is.null`);
  if (scope === "archive-index") return query.eq("is_completed", true).lt("completed_at", currentStart);
  if (scope !== "all") {
    const year = Number(scope.slice(0,4)), month = Number(scope.slice(5));
    const next = `${year + (month === 12 ? 1 : 0)}-${String(month % 12 + 1).padStart(2,"0")}`;
    return query.eq("is_completed", true).gte("completed_at", `${scope}-01T00:00:00+08:00`).lt("completed_at", `${next}-01T00:00:00+08:00`);
  }
  return query;
}
async function visibleTasks(admin: NonNullable<ReturnType<typeof createAdminClient>>, profile: { id: string; role?: string | null }, scope: string) {
  const select = scope === "archive-index" ? "id, title, completed_at" : TASK_SELECT;
  const build = () => taskQuery(admin.from("my_work_tasks").select(select, { count: "exact" }).order("created_at", { ascending: false }).order("id"),scope);
  if (isLeadership(profile.role)) {
    return readAllPages((from, to) => build().range(from, to));
  }
  const [assigned, own] = await Promise.all([
    readAllPages((from, to) => admin.from("my_work_task_assignees").select("task_id", { count: "exact" }).eq("staff_profile_id", profile.id).order("task_id").range(from, to)),
    readAllPages((from, to) => build().eq("created_by_profile_id", profile.id).range(from, to))
  ]);
  const assignedIds = [...new Set(assigned.map((row) => row.task_id))];
  const ownIds = new Set(own.map((task) => task.id));
  const additional: any[] = [];
  for (let index = 0; index < assignedIds.length; index += 200) {
    const ids = assignedIds.slice(index, index + 200).filter((id) => !ownIds.has(id));
    if (!ids.length) continue;
    const data = await readAllPages((from, to) => build().in("id", ids).range(from,to));
    additional.push(...(data || []));
  }
  return [...own, ...additional].sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
}

export async function readMyWork(admin: CurrentActor["admin"], profile: { id: string; role?: string | null }, requestedScope = "all") {
  const scope = taskReadScope(requestedScope), visible = await visibleTasks(admin, profile, scope) as TaskRow[];
  if (scope === "archive-index") {
    const months = new Map<string, { key: string; count: number; titles: string[] }>();
    for (const task of visible) {
      if (!task.completed_at || !Number.isFinite(Date.parse(task.completed_at))) continue;
      const key = currentTaskMonth(new Date(task.completed_at)), month = months.get(key) || { key, count: 0, titles: [] };
      month.count++; month.titles.push(task.title); months.set(key,month);
    }
    return { tasks: [], scope, archiveMonths: [...months.values()].sort((a,b)=>b.key.localeCompare(a.key)), currentMonth: currentTaskMonth() };
  }
  const preferences: any[] = [];
  for (let index = 0; index < visible.length; index += 200) {
    const data = await readAllPages((from,to) => admin.from("my_work_task_preferences").select("task_id, favorite, favorited_at", { count: "exact" }).eq("staff_profile_id", profile.id).in("task_id", visible.slice(index, index + 200).map(task => task.id)).order("task_id").range(from,to));
    preferences.push(...(data || []));
  }
  const preferenceByTask = new Map(preferences.map(item => [item.task_id, item]));
  return { tasks: visible.map(task => taskResponse(task, preferenceByTask.get(task.id))), scope, currentMonth: currentTaskMonth() };
}
