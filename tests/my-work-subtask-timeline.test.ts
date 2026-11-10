import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { taskSteps, validateTaskSteps } from "../lib/my-work-steps.ts";
import { latestCaseReportProgress, lastCaseReportUpdates } from "../lib/case-report-progress.ts";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";

const taskId = "11111111-1111-4111-8111-111111111111";
const stepId = "22222222-2222-4222-8222-222222222222";

test("legacy step identities are deterministic and server validation strips fabricated history/actor fields", () => {
  const legacy = [{ title: "Worksheet", done: true }, { title: "Meeting", done: false }];
  const before = JSON.stringify(legacy), projected = taskSteps(legacy, taskId);
  assert.equal(projected[0].id, `legacy:${taskId}:0`);
  assert.equal(JSON.stringify(legacy), before, "reads must not rewrite historical tasks");
  const normalized = validateTaskSteps([{ ...projected[0], completedAt: "yesterday", actor: "someone else" }, { title: "Meeting", done: true }], legacy, taskId);
  assert.deepEqual(normalized.map(step => step.id), projected.map(step => step.id));
  assert.deepEqual(Object.keys(normalized[0]), ["id", "title", "done"]);
  assert.deepEqual(validateTaskSteps([projected[1], projected[0]], projected, taskId).map(step => step.id), [projected[1].id, projected[0].id], "reordering must not change identities");
  assert.throws(() => validateTaskSteps([{ id: stepId, title: "A", done: true }, { id: stepId, title: "B", done: true }], [], taskId), /distinct/);
  assert.throws(() => validateTaskSteps([{ title: "A", done: "true" }], [], taskId), /checkbox/);
  assert.throws(() => validateTaskSteps(Array.from({ length: 501 }, () => ({ title: "A", done: false })), [], taskId), /500/);
});

function fixture() {
  const profile = { id: "pic", auth_user_id: "user", display_name: "Actual PIC", directory_active: true, role: "staff" };
  const db = mockDatabase({ staff_profiles: [profile], tax_cases: [{ id: "case", tax_pic_profile_id: "pic", deleted_at: null }], my_work_tasks: [{
    id: taskId, title: "Parent case work", notes: "", steps: [{ id: stepId, title: "Worksheet", done: false }], case_id: "case",
    is_completed: false, completed_at: null, repeat_rule: "none", created_by_profile_id: "pic", created_at: "2026-11-01T00:00:00Z", updated_at: "v1", my_work_task_assignees: []
  }] });
  const calls: string[] = [], from = db.from.bind(db); db.from = name => { calls.push(name); return from(name); };
  const route = loadRoute("app/api/my-work/route.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/supabase/server": { createClient: async () => ({ from: db.from.bind(db), auth: { getUser: async () => ({ data: { user: { id: "user" } } }) } }) },
    "@/lib/notifications": {}
  });
  const save = (body: any) => route.PATCH(request({ id: taskId, version: db.tables.my_work_tasks[0].updated_at, ...body }));
  return { db, route, save, calls, profile };
}

test("step checks save with verified actor and a fresh transition token in one task write, without completing the parent or awarding points", async () => {
  const d = fixture(), response = await d.save({ steps: [{ id: stepId, title: "Worksheet", done: true, actor: "forged" }], step_change_actor_profile_id: "forged" });
  assert.equal(response.status, 200);
  const row = d.db.tables.my_work_tasks[0];
  assert.equal(row.step_change_actor_profile_id, "pic"); assert.match(row.step_change_id, /^[0-9a-f-]{36}$/);
  assert.equal(row.is_completed, false); assert.equal(response.body.task.done, false);
  assert.equal(row.steps[0].actor, undefined);
  assert.equal(response.body.task.step_change_actor_profile_id, undefined);
  assert.deepEqual(d.calls, ["staff_profiles", "my_work_tasks", "my_work_tasks"], "no per-step history API or extra database round trips");
  const token = row.step_change_id;
  assert.equal((await d.save({ note: "A note", steps: response.body.task.steps })).status, 200);
  assert.equal(row.step_change_id, token, "unchanged steps cannot claim another actor transition");
  assert.equal((await d.save({ steps: [{ ...row.steps[0], done: false }] })).status, 200);
  assert.notEqual(row.step_change_id, token, "reopening gets a distinct event token");
});

test("unauthorized, invalid and conflicting subtask saves cannot write progress", async () => {
  const d = fixture(), original = JSON.stringify(d.db.tables.my_work_tasks);
  assert.equal((await d.save({ steps: [{ id: stepId, title: "", done: true }] })).status, 400);
  assert.equal((await d.save({ version: "stale", steps: [{ id: stepId, title: "Worksheet", done: true }] })).status, 409);
  assert.equal(JSON.stringify(d.db.tables.my_work_tasks), original);
  d.db.tables.my_work_tasks[0].created_by_profile_id = "another-pic";
  assert.equal((await d.save({ steps: [{ id: stepId, title: "Worksheet", done: true }] })).status, 403);
  assert.equal(d.db.tables.my_work_tasks[0].steps[0].done, false);
});

test("creating checked steps attributes the real actor and returns stable step IDs", async () => {
  const d = fixture();
  const saved = await d.route.POST(request({ clientRequestId: "creation-request-111", title: "New work", caseId: "case", steps: [{ title: "Meeting", done: true }] }));
  assert.equal(saved.status, 201);
  assert.ok(saved.body.task.steps[0].id); assert.equal(saved.body.task.done, false);
  assert.equal(d.db.tables.my_work_tasks[1].step_change_actor_profile_id, "pic");
});

test("the Cases timeline shows checked steps independently of parent completion, with context and honest historical labels", () => {
  const html = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");
  const start = html.indexOf("    function caseTimeline(item, progress) {"), end = html.indexOf("    function renderCaseProgressPanel", start);
  const dom = new JSDOM("", { runScripts: "outside-only" });
  try {
    const w = dom.window as any;
    w.eval(`${html.slice(start, end)} window.timeline = caseTimeline;`);
    const result = w.timeline({}, { taskTimeline: [
      { id: "recent", task_id: taskId, step_id: stepId, step_title: "Worksheet", title: "SP2DK 2023", event_type: "step_completed", actor_name: "Actual PIC", occurred_at: "2026-11-10T00:00:00Z" },
      { id: "legacy", task_id: taskId, step_id: "legacy-step", step_title: "Earlier meeting", title: "SP2DK 2023", event_type: "step_snapshot", actor_name: "Completion PIC not recorded", occurred_at: null }
    ], completedTasks: [{ id: taskId, title: "Parent completed separately", completedAt: "2026-11-11T00:00:00Z" }] });
    assert.equal(result.length, 3, "step snapshots must not hide a separate parent completion");
    assert.equal(result[1].entry, "Completed step: Worksheet"); assert.equal(result[1].taskTitle, "SP2DK 2023");
    assert.equal(result[2].historical, true); assert.equal(result[2].createdAt, null);
    assert.match(html, /Completion date not recorded/);
  } finally { dom.window.close(); }
});

test("dated step progress appears in print reports; historical checkmarks do not reset inactivity or hide parent progress", () => {
  const cases = [{ id: "case", updated_at: "2026-11-01T00:00:00Z" }];
  const snapshots = [{ case_id: "case", task_id: taskId, step_id: stepId, step_title: "Meeting", title: "SP2DK 2023", event_type: "step_completed", actor_name: "Actual PIC", occurred_at: "2026-11-10T00:00:00Z" }];
  const latest = latestCaseReportProgress(cases, snapshots, [], []);
  assert.match(latest.case!.entry, /Completed step: Meeting.*SP2DK 2023/);
  assert.equal(lastCaseReportUpdates(cases, latest).case.creatorName, "Actual PIC");
  const historical = snapshots.map(row => ({ ...row, event_type: "step_snapshot", occurred_at: null }));
  assert.equal(latestCaseReportProgress(cases, historical, [], []).case, null);
  assert.equal(latestCaseReportProgress(cases, historical, [], [{ id: taskId, case_id: "case", title: "Parent", completed_at: "2026-11-09T00:00:00Z" }]).case!.entry, "Parent");
});
