import { NextResponse } from "next/server";
import { createOperationalAnnouncement } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type TaskRow = {
  id: string;
  title: string;
  notes: string;
  steps: unknown[];
  reminder_at: string | null;
  due_date: string | null;
  repeat_rule: string;
  repeat_custom_date: string | null;
  repeat_parent_id: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  created_by_profile_id: string;
  staff_profiles?: { display_name?: string | null; full_name?: string | null } | null;
  my_work_task_assignees?: Array<{ staff_profile_id: string; staff_profiles?: { display_name?: string | null; full_name?: string | null } | null }>;
};

async function currentProfile() {
  const supabase = await createClient();
  if (!supabase) return { error: "Database is not configured.", status: 503 as const };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Authentication is required.", status: 401 as const };
  const { data: profile, error } = await supabase.from("staff_profiles").select("id, full_name, display_name, role").eq("auth_user_id", user.id).maybeSingle();
  if (error || !profile) return { error: "Staff profile was not found.", status: 403 as const };
  return { supabase, user, profile };
}

function displayName(profile: { display_name?: string | null; full_name?: string | null }) {
  return profile.display_name || profile.full_name || "Unknown";
}

function isLeadership(role: string | null | undefined) {
  return ["supervisor", "partner", "admin"].includes(String(role || "").toLowerCase());
}

function taskResponse(task: TaskRow, preference?: { favorite?: boolean | null; favorited_at?: string | null } | null) {
  return {
    id: task.id,
    title: task.title,
    note: task.notes || "",
    steps: Array.isArray(task.steps) ? task.steps : [],
    reminder: task.reminder_at ? task.reminder_at.slice(0, 16) : "",
    dueDate: task.due_date || "",
    repeatRule: task.repeat_rule || "none",
    repeatCustomDate: task.repeat_custom_date ? task.repeat_custom_date.slice(0, 16) : "",
    repeatParentId: task.repeat_parent_id || "",
    done: Boolean(task.is_completed),
    completedAt: task.completed_at ? new Date(task.completed_at).getTime() : 0,
    createdAt: new Date(task.created_at).getTime(),
    createdAtText: task.created_at,
    creatorName: displayName(task.staff_profiles || {}),
    assignees: (task.my_work_task_assignees || []).map((assignee) => displayName(assignee.staff_profiles || {})),
    favorite: Boolean(preference?.favorite),
    favoritedAt: preference?.favorited_at ? new Date(preference.favorited_at).getTime() : 0
  };
}

async function staffByNames(admin: NonNullable<ReturnType<typeof createAdminClient>>, names: string[]) {
  const wanted = new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean));
  if (!wanted.size) return [];
  const { data, error } = await admin.from("staff_profiles").select("id, display_name, full_name");
  if (error) throw new Error(error.message);
  return (data || []).filter((staff) => wanted.has(displayName(staff).toLowerCase()));
}

function nextRepeatDate(task: TaskRow) {
  const base = new Date();
  if (task.repeat_rule === "daily") base.setDate(base.getDate() + 1);
  if (task.repeat_rule === "weekly") base.setDate(base.getDate() + 7);
  if (task.repeat_rule === "monthly") base.setMonth(base.getMonth() + 1);
  if (task.repeat_rule === "annually") base.setFullYear(base.getFullYear() + 1);
  if (task.repeat_rule === "custom" && task.repeat_custom_date) return new Date(task.repeat_custom_date);
  return task.repeat_rule === "none" ? null : base;
}

async function createFollowUpTask(admin: NonNullable<ReturnType<typeof createAdminClient>>, task: TaskRow) {
  if (task.repeat_rule === "none") return;
  const { data: existing } = await admin.from("my_work_tasks").select("id").eq("repeat_parent_id", task.id).maybeSingle();
  if (existing) return;
  const repeatAt = nextRepeatDate(task);
  if (!repeatAt || repeatAt.getTime() <= Date.now()) return;
  const isCustom = task.repeat_rule === "custom";
  const { data: created, error } = await admin.from("my_work_tasks").insert({
    title: task.title,
    notes: task.notes,
    steps: task.steps,
    reminder_at: null,
    due_date: isCustom ? repeatAt.toISOString().slice(0, 10) : task.due_date,
    repeat_rule: isCustom ? "none" : task.repeat_rule,
    repeat_custom_date: isCustom ? null : task.repeat_custom_date,
    repeat_parent_id: task.id,
    created_by_profile_id: task.created_by_profile_id
  }).select("id").single();
  if (error || !created) throw new Error(error?.message || "Could not create recurring task.");
  const { data: assignees } = await admin.from("my_work_task_assignees").select("staff_profile_id").eq("task_id", task.id);
  if (assignees?.length) await admin.from("my_work_task_assignees").insert(assignees.map((item) => ({ task_id: created.id, staff_profile_id: item.staff_profile_id })));
}

export async function GET() {
  const current = await currentProfile();
  if ("error" in current) return NextResponse.json({ error: current.error }, { status: current.status });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Task service is not configured." }, { status: 503 });
  const { data, error } = await admin
    .from("my_work_tasks")
    .select("*, staff_profiles!my_work_tasks_created_by_profile_id_fkey(display_name, full_name), my_work_task_assignees(staff_profile_id, staff_profiles(display_name, full_name))")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const visible = (data || []).filter((task: TaskRow) => isLeadership(current.profile.role) || task.created_by_profile_id === current.profile.id || (task.my_work_task_assignees || []).some((assignee) => assignee.staff_profile_id === current.profile.id));
  const ids = visible.map((task: TaskRow) => task.id);
  const { data: preferences } = ids.length ? await admin.from("my_work_task_preferences").select("task_id, favorite, favorited_at").eq("staff_profile_id", current.profile.id).in("task_id", ids) : { data: [] };
  const preferenceByTask = new Map((preferences || []).map((item) => [item.task_id, item]));
  return NextResponse.json({ tasks: visible.map((task: TaskRow) => taskResponse(task, preferenceByTask.get(task.id))) });
}

export async function POST(request: Request) {
  const current = await currentProfile();
  if ("error" in current) return NextResponse.json({ error: current.error }, { status: current.status });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Task service is not configured." }, { status: 503 });
  const body = await request.json();
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "Task title is required." }, { status: 400 });
  const repeatRule = ["none", "daily", "weekly", "monthly", "annually", "custom"].includes(body.repeatRule) ? body.repeatRule : "none";
  const { data, error } = await admin.from("my_work_tasks").insert({
    title,
    notes: String(body.note || ""),
    steps: Array.isArray(body.steps) ? body.steps : [],
    reminder_at: body.reminder || null,
    due_date: body.dueDate || null,
    repeat_rule: repeatRule,
    repeat_custom_date: repeatRule === "custom" ? body.repeatCustomDate || null : null,
    created_by_profile_id: current.profile.id
  }).select("*, staff_profiles!my_work_tasks_created_by_profile_id_fkey(display_name, full_name), my_work_task_assignees(staff_profile_id, staff_profiles(display_name, full_name))").single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Task could not be created." }, { status: 500 });
  const assignees = await staffByNames(admin, Array.isArray(body.assignees) ? body.assignees : []);
  const additional = assignees.filter((staff) => staff.id !== current.profile.id);
  if (additional.length) await admin.from("my_work_task_assignees").insert(additional.map((staff) => ({ task_id: data.id, staff_profile_id: staff.id })));
  if (additional.length) await createOperationalAnnouncement({ title: "Task assigned to you", message: `${displayName(current.profile)} assigned you: ${title}`, senderProfileId: current.profile.id, recipientNames: additional.map(displayName) });
  const { data: complete } = await admin.from("my_work_tasks").select("*, staff_profiles!my_work_tasks_created_by_profile_id_fkey(display_name, full_name), my_work_task_assignees(staff_profile_id, staff_profiles(display_name, full_name))").eq("id", data.id).single();
  return NextResponse.json({ task: taskResponse(complete as TaskRow) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const current = await currentProfile();
  if ("error" in current) return NextResponse.json({ error: current.error }, { status: current.status });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Task service is not configured." }, { status: 503 });
  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Task id is required." }, { status: 400 });
  const { data: task, error: taskError } = await admin.from("my_work_tasks").select("*, staff_profiles!my_work_tasks_created_by_profile_id_fkey(display_name, full_name), my_work_task_assignees(staff_profile_id, staff_profiles(display_name, full_name))").eq("id", id).maybeSingle();
  if (taskError || !task) return NextResponse.json({ error: taskError?.message || "Task was not found." }, { status: 404 });
  const visible = isLeadership(current.profile.role) || task.created_by_profile_id === current.profile.id || (task.my_work_task_assignees || []).some((assignee: { staff_profile_id: string }) => assignee.staff_profile_id === current.profile.id);
  if (!visible) return NextResponse.json({ error: "You do not have access to this task." }, { status: 403 });

  if (typeof body.favorite === "boolean") {
    const { error } = await admin.from("my_work_task_preferences").upsert({ task_id: id, staff_profile_id: current.profile.id, favorite: body.favorite, favorited_at: body.favorite ? new Date().toISOString() : null });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
  if (typeof body.note === "string") update.notes = body.note;
  if (Array.isArray(body.steps)) update.steps = body.steps;
  if (typeof body.reminder === "string") update.reminder_at = body.reminder || null;
  if (typeof body.dueDate === "string") update.due_date = body.dueDate || null;
  if (["none", "daily", "weekly", "monthly", "annually", "custom"].includes(body.repeatRule)) {
    update.repeat_rule = body.repeatRule;
    update.repeat_custom_date = body.repeatRule === "custom" ? body.repeatCustomDate || null : null;
  }
  if (typeof body.done === "boolean") {
    update.is_completed = body.done;
    update.completed_at = body.done ? new Date().toISOString() : null;
  }
  let updated = task as TaskRow;
  if (Object.keys(update).length) {
    const { data, error } = await admin.from("my_work_tasks").update(update).eq("id", id).select("*, staff_profiles!my_work_tasks_created_by_profile_id_fkey(display_name, full_name), my_work_task_assignees(staff_profile_id, staff_profiles(display_name, full_name))").single();
    if (error || !data) return NextResponse.json({ error: error?.message || "Task could not be updated." }, { status: 500 });
    updated = data as TaskRow;
  }
  if (Array.isArray(body.addAssignees) && body.addAssignees.length) {
    const currentIds = new Set((task.my_work_task_assignees || []).map((assignee: { staff_profile_id: string }) => assignee.staff_profile_id));
    const staff = (await staffByNames(admin, body.addAssignees)).filter((person) => person.id !== task.created_by_profile_id && !currentIds.has(person.id));
    if (staff.length) {
      const { error } = await admin.from("my_work_task_assignees").insert(staff.map((person) => ({ task_id: id, staff_profile_id: person.id })));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await createOperationalAnnouncement({ title: "Task assigned to you", message: `${displayName(current.profile)} assigned you: ${updated.title}`, senderProfileId: current.profile.id, recipientNames: staff.map(displayName) });
    }
  }
  if (body.done === true && !task.is_completed) await createFollowUpTask(admin, updated);
  const { data: finalTask } = await admin.from("my_work_tasks").select("*, staff_profiles!my_work_tasks_created_by_profile_id_fkey(display_name, full_name), my_work_task_assignees(staff_profile_id, staff_profiles(display_name, full_name))").eq("id", id).single();
  const { data: preference } = await admin.from("my_work_task_preferences").select("favorite, favorited_at").eq("task_id", id).eq("staff_profile_id", current.profile.id).maybeSingle();
  return NextResponse.json({ task: taskResponse(finalTask as TaskRow, preference) });
}
