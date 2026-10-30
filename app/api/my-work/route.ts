import { after, NextResponse } from "next/server";
import { createOperationalAnnouncement, notificationEventKey } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readMyWork, taskResponse, TASK_SELECT, type TaskRow } from "@/lib/my-work-read";


async function currentProfile() {
  const supabase = await createClient();
  if (!supabase) return { error: "Database is not configured.", status: 503 as const };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Authentication is required.", status: 401 as const };
  const { data: profile, error } = await supabase.from("staff_profiles").select("id, full_name, display_name, role, directory_active").eq("auth_user_id", user.id).maybeSingle();
  if (error || !profile) return { error: "Staff profile was not found.", status: 403 as const };
  if (profile.directory_active !== true) return { error: "Your staff access has been deactivated.", status: 403 as const };
  return { supabase, user, profile };
}

function displayName(profile: { display_name?: string | null; full_name?: string | null }) {
  return profile.display_name || profile.full_name || "Unknown";
}

function isLeadership(role: string | null | undefined) {
  return ["leader", "supervisor", "partner", "admin"].includes(String(role || "").toLowerCase());
}


const TASK_MUTATION_SELECT = "id, title, notes, steps, reminder_at, due_date, repeat_rule, repeat_custom_date, repeat_parent_id, case_id, is_completed, completed_at, completed_by_profile_id, created_at, updated_at, created_by_profile_id, my_work_task_assignees(staff_profile_id)";


async function accessibleCaseId(admin: NonNullable<ReturnType<typeof createAdminClient>>, profileId: string, role: string | null | undefined, caseId: unknown) {
  const id = String(caseId || "").trim();
  if (!id) return null;
  const { data, error } = await admin
    .from("tax_cases")
    .select("id, tax_pic_profile_id, accounting_pic_profile_id, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data || data.deleted_at || (!isLeadership(role) && data.tax_pic_profile_id !== profileId && data.accounting_pic_profile_id !== profileId)) {
    throw new Error("The selected Case is unavailable in your assigned scope.");
  }
  return data.id;
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
    case_id: task.case_id,
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
  try { return NextResponse.json(await readMyWork(admin, current.profile)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Tasks could not be loaded." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const current = await currentProfile();
  if ("error" in current) return NextResponse.json({ error: current.error }, { status: current.status });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Task service is not configured." }, { status: 503 });
  const body = await request.json();
  const title = String(body.title || "").trim();
  const requestId = String(body.clientRequestId || "").trim();
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(requestId)) return NextResponse.json({ error: "A stable task creation ID is required. Reload your workspace." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Task title is required." }, { status: 400 });
  const repeatRule = ["none", "daily", "weekly", "monthly", "annually", "custom"].includes(body.repeatRule) ? body.repeatRule : "none";
  let caseId: string | null;
  try {
    caseId = await accessibleCaseId(admin, current.profile.id, current.profile.role, body.caseId);
  } catch (caseError) {
    return NextResponse.json({ error: caseError instanceof Error ? caseError.message : "Case could not be linked." }, { status: 403 });
  }
  let replayed = false;
  let { data, error } = await admin.from("my_work_tasks").insert({
    client_request_id: requestId,
    title,
    notes: String(body.note || ""),
    steps: Array.isArray(body.steps) ? body.steps : [],
    reminder_at: body.reminder || null,
    due_date: body.dueDate || null,
    repeat_rule: repeatRule,
    repeat_custom_date: repeatRule === "custom" ? body.repeatCustomDate || null : null,
    case_id: caseId,
    is_completed: Boolean(body.done),
    completed_at: body.done ? new Date().toISOString() : null,
    completed_by_profile_id: body.done ? current.profile.id : null,
    created_by_profile_id: current.profile.id
  }).select(TASK_SELECT).single();
  if (error?.code === "23505") {
    replayed = true;
    const existing = await admin.from("my_work_tasks").select(TASK_SELECT).eq("created_by_profile_id", current.profile.id).eq("client_request_id", requestId).maybeSingle();
    data = existing.data;
    error = existing.error;
  }
  if (error || !data) return NextResponse.json({ error: error?.message || "Task could not be created." }, { status: 500 });
  const assignees = await staffByNames(admin, Array.isArray(body.assignees) ? body.assignees : []);
  const additional = assignees.filter((staff) => staff.id !== current.profile.id);
  if (additional.length) {
    const { error: assignmentError } = await admin.from("my_work_task_assignees").upsert(additional.map((staff) => ({ task_id: data.id, staff_profile_id: staff.id })), { onConflict: "task_id,staff_profile_id", ignoreDuplicates: true });
    if (assignmentError) return NextResponse.json({ error: assignmentError.message }, { status: 500 });
  }
  if (additional.length) after(async () => {
    try {
      await createOperationalAnnouncement({
        title: "Task assigned to you",
        message: `${displayName(current.profile)} assigned you: ${title}`,
        senderProfileId: current.profile.id,
        recipientProfileIds: additional.map((staff) => staff.id),
        eventKey: notificationEventKey("my-work-assignment", data.id),
        sourceType: "my_work_task",
        sourceId: data.id
      });
    } catch (error) {
      console.error("[my-work] assignment notification could not be created", error);
    }
  });
  const responseTask = taskResponse(data as TaskRow);
  responseTask.creatorName = displayName(current.profile);
  if (additional.length) responseTask.assignees = [...new Set([...responseTask.assignees, ...additional.map(displayName)])];
  return NextResponse.json({ task: responseTask, replayed }, { status: 201 });
}

export async function PATCH(request: Request) {
  const current = await currentProfile();
  if ("error" in current) return NextResponse.json({ error: current.error }, { status: current.status });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Task service is not configured." }, { status: 503 });
  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Task id is required." }, { status: 400 });
  const { data: task, error: taskError } = await admin.from("my_work_tasks").select(TASK_MUTATION_SELECT).eq("id", id).maybeSingle();
  if (taskError || !task) return NextResponse.json({ error: taskError?.message || "Task was not found." }, { status: 404 });
  const visible = isLeadership(current.profile.role) || task.created_by_profile_id === current.profile.id || (task.my_work_task_assignees || []).some((assignee: { staff_profile_id: string }) => assignee.staff_profile_id === current.profile.id);
  if (!visible) return NextResponse.json({ error: "You do not have access to this task." }, { status: 403 });

  if (body.version !== task.updated_at) return NextResponse.json({ error: "This task changed in another session. Your edits are retained for reconciliation.", code: "VERSION_CONFLICT", task: taskResponse(task as TaskRow) }, { status: 409 });

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
  if (typeof body.caseId === "string" && (body.caseId || null) !== task.case_id) {
    try {
      update.case_id = await accessibleCaseId(admin, current.profile.id, current.profile.role, body.caseId);
    } catch (caseError) {
      return NextResponse.json({ error: caseError instanceof Error ? caseError.message : "Case could not be linked." }, { status: 403 });
    }
  }
  if (typeof body.done === "boolean") {
    update.is_completed = body.done;
    update.completed_at = body.done ? task.completed_at || new Date().toISOString() : null;
    update.completed_by_profile_id = body.done ? task.completed_by_profile_id || current.profile.id : null;
  }
  let updated = task as TaskRow;
  if (Object.keys(update).length) {
    const { data, error } = await admin.from("my_work_tasks").update(update).eq("id", id).eq("updated_at", body.version).select(TASK_MUTATION_SELECT).maybeSingle();
    if (!error && !data) return NextResponse.json({ error: "Another session saved this task first.", code: "VERSION_CONFLICT" }, { status: 409 });
    if (error || !data) return NextResponse.json({ error: error?.message || "Task could not be updated." }, { status: 500 });
    updated = data as TaskRow;
  }
  if (typeof body.done === "boolean" && body.done !== task.is_completed) {
    const { count } = await admin.from("my_work_task_completion_events").select("id", { count: "exact", head: true }).eq("task_id", id).eq("event_type", "completed");
    const cycle = body.done ? Number(count || 0) + 1 : Math.max(1, Number(count || 0));
    const eventType = body.done ? "completed" : "reopened";
    const { error: eventError } = await admin.from("my_work_task_completion_events").insert({ task_id: id, actor_profile_id: current.profile.id, event_type: eventType, completion_cycle: cycle });
    if (eventError && eventError.code !== "23505") return NextResponse.json({ error: eventError.message }, { status: 500 });
    if (task.case_id) {
      const sourceKey = `my-work:${id}:cycle:${cycle}`;
      if (body.done) {
        await admin.from("performance_point_ledger").upsert({ staff_profile_id: current.profile.id, period_key: new Date().toISOString().slice(0, 7), source_type: "case_linked_task", source_key: sourceKey, event_type: "completed", points: 1, status: "pending", metadata: { task_id: id, case_id: task.case_id, completion_cycle: cycle } }, { onConflict: "source_key,event_type", ignoreDuplicates: true });
      } else {
        const { data: earned } = await admin.from("performance_point_ledger").select("id, staff_profile_id, period_key, points").eq("source_key", sourceKey).eq("event_type", "completed").maybeSingle();
        if (earned) await admin.from("performance_point_ledger").upsert({ staff_profile_id: earned.staff_profile_id, period_key: earned.period_key, source_type: "case_linked_task", source_key: sourceKey, event_type: "reopened", points: -Number(earned.points), status: "pending", reversed_by_entry_id: earned.id, metadata: { task_id: id, case_id: task.case_id, completion_cycle: cycle, reopened_by: current.profile.id } }, { onConflict: "source_key,event_type", ignoreDuplicates: true });
      }
    }
  }
  let savedPreference: { favorite: boolean; favorited_at: string | null } | null = null;
  if (typeof body.favorite === "boolean") {
    const favoritedAt = body.favorite ? new Date().toISOString() : null;
    const { error } = await admin.from("my_work_task_preferences").upsert({ task_id: id, staff_profile_id: current.profile.id, favorite: body.favorite, favorited_at: favoritedAt });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    savedPreference = { favorite: body.favorite, favorited_at: favoritedAt };
  }
  let addedAssigneeNames: string[] = [];
  if (Array.isArray(body.addAssignees) && body.addAssignees.length) {
    const currentIds = new Set((task.my_work_task_assignees || []).map((assignee: { staff_profile_id: string }) => assignee.staff_profile_id));
    const staff = (await staffByNames(admin, body.addAssignees)).filter((person) => person.id !== task.created_by_profile_id && !currentIds.has(person.id));
    if (staff.length) {
      const { error } = await admin.from("my_work_task_assignees").insert(staff.map((person) => ({ task_id: id, staff_profile_id: person.id })));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      addedAssigneeNames = staff.map(displayName);
      after(async () => {
        try {
          await createOperationalAnnouncement({
            title: "Task assigned to you",
            message: `${displayName(current.profile)} assigned you: ${updated.title}`,
            senderProfileId: current.profile.id,
            recipientProfileIds: staff.map((person) => person.id),
            eventKey: notificationEventKey("my-work-assignment", `${id}:${staff.map((person) => person.id).sort().join(",")}`),
            sourceType: "my_work_task",
            sourceId: id
          });
        } catch (error) {
          console.error("[my-work] assignment notification could not be created", error);
        }
      });
    }
  }
  if (body.done === true && !task.is_completed) await createFollowUpTask(admin, updated);
  const responseTask = taskResponse(updated, savedPreference);
  if (addedAssigneeNames.length) responseTask.assignees = [...new Set([...responseTask.assignees, ...addedAssigneeNames])];
  return NextResponse.json({ task: responseTask });
}
