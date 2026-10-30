import { isLeadership, type CurrentActor } from "@/lib/access";
import type { createAdminClient } from "@/lib/supabase/admin";

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
    steps: Array.isArray(task.steps) ? task.steps : [],
    reminder: task.reminder_at ? task.reminder_at.slice(0, 16) : "",
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
async function pagedQuery(build: (from: number, to: number) => any, pageSize = 500) {
  const rows: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if ((data || []).length < pageSize) return rows;
  }
}

async function visibleTasks(admin: NonNullable<ReturnType<typeof createAdminClient>>, profile: { id: string; role?: string | null }) {
  if (isLeadership(profile.role)) {
    return pagedQuery((from, to) => admin.from("my_work_tasks").select(TASK_SELECT).order("created_at", { ascending: false }).range(from, to));
  }
  const [assigned, own] = await Promise.all([
    pagedQuery((from, to) => admin.from("my_work_task_assignees").select("task_id").eq("staff_profile_id", profile.id).range(from, to)),
    pagedQuery((from, to) => admin.from("my_work_tasks").select(TASK_SELECT).eq("created_by_profile_id", profile.id).order("created_at", { ascending: false }).range(from, to))
  ]);
  const assignedIds = [...new Set(assigned.map((row) => row.task_id))];
  const ownIds = new Set(own.map((task) => task.id));
  const additional: any[] = [];
  for (let index = 0; index < assignedIds.length; index += 200) {
    const ids = assignedIds.slice(index, index + 200).filter((id) => !ownIds.has(id));
    if (!ids.length) continue;
    const { data, error } = await admin.from("my_work_tasks").select(TASK_SELECT).in("id", ids);
    if (error) throw new Error(error.message);
    additional.push(...(data || []));
  }
  return [...own, ...additional].sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
}

export async function readMyWork(admin: CurrentActor["admin"], profile: { id: string; role?: string | null }) {
  const visible = await visibleTasks(admin, profile) as TaskRow[];
  const preferences: any[] = [];
  for (let index = 0; index < visible.length; index += 200) {
    const { data, error } = await admin.from("my_work_task_preferences").select("task_id, favorite, favorited_at").eq("staff_profile_id", profile.id).in("task_id", visible.slice(index, index + 200).map(task => task.id));
    if (error) throw new Error(error.message);
    preferences.push(...(data || []));
  }
  const preferenceByTask = new Map(preferences.map(item => [item.task_id, item]));
  return { tasks: visible.map(task => taskResponse(task, preferenceByTask.get(task.id))) };
}
