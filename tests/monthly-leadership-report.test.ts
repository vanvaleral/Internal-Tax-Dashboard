import assert from "node:assert/strict";
import test from "node:test";
import * as report from "../lib/monthly-leadership-report.ts";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";

const people = [{ id: "tax", full_name: "Tax PIC", directory_active: true }, { id: "acc", full_name: "ACC PIC", directory_active: true }, { id: "idle", full_name: "No Cases", directory_active: true }];
const sample = { id: "one", client_name: "Example Client", case_category: "Himbauan", created_at: "2026-09-20T02:00:00Z", tax_pic_profile_id: "tax", accounting_pic_profile_id: "acc" };
const events: report.ReportEvent[] = [
  { id: "september", case_id: "one", kind: "follow-up", pic: "tax", at: "2026-09-30T15:59:59Z", text: "Preliminary review" },
  { id: "october", case_id: "one", kind: "follow-up", pic: "tax", at: "2026-10-05T02:00:00Z", text: "Response in October" }
];

test("WITA month cutoffs exclude later follow-ups and do not double count linked completed tasks", () => {
  assert.equal(report.monthBounds("2026-09")?.end, "2026-10-01T00:00:00+08:00");
  const linked: report.ReportEvent = { id: "linked", case_id: "one", kind: "task", pic: "acc", at: "2026-09-30T15:59:58Z", timelineOnly: true };
  const boundary: report.ReportEvent = { id: "boundary", kind: "task", pic: "acc", at: "2026-09-30T16:00:00Z" };
  const cases = [{ ...sample, stage: "Closed", closed_at: "2026-10-09" }];
  const sep = report.buildMonthlyLeadershipReport("2026-09", cases, people, [...events, linked, boundary]);
  assert.equal(sep.cases[0].state, "Open");
  assert.equal(sep.cases[0].latest?.text, "Preliminary review");
  assert.equal(sep.cases[0].updates, 2);
  assert.deepEqual(sep.staff.map(pic => pic.id), ["tax"]);
  const oct = report.buildMonthlyLeadershipReport("2026-10", cases, people, [...events, boundary]);
  assert.equal(oct.cases[0].state, "Closed");
  assert.equal(oct.cases[0].latest?.text, "Response in October");
  assert.equal(oct.staff.find(pic => pic.id === "acc")?.tasks, 1);
});

test("the watch checks each currently assigned PIC separately and excludes new, closed and archived cases", () => {
  const cases = [sample, { ...sample, id: "new", created_at: "2026-10-12T03:00:00Z" }, { ...sample, id: "closed", stage: "Closed" }, { ...sample, id: "archived", deleted_at: "2026-10-01T00:00:00Z" }];
  const rows = report.followUpWatch(new Date("2026-10-25T02:00:00Z"), cases, people, events);
  assert.deepEqual(rows.map(row => [row.name, row.open, row.stale, row.recent]), [["ACC PIC", 2, 1, null]]);
});

test("only leadership can finalize a closed month and the saved copy cannot be replaced", async () => {
  const db = mockDatabase({
    monthly_leadership_reports: [], staff_profiles: people, tax_cases: [sample],
    tax_case_progress_entries: [{ id: "entry", case_id: "one", created_at: "2026-09-25T02:00:00Z", entry: "Original", created_by_profile_id: "tax" }]
  });
  const profile = { id: "tax", full_name: "Tax PIC", role: "staff" };
  const api = loadRoute("app/api/management/monthly-report/route.ts", {
    "@/lib/access": { currentActor: async () => ({ admin: db, profile }), isLeadership: (role: string) => role === "supervisor" },
    "@/lib/monthly-leadership-report": report
  });
  assert.equal((await api.POST(request({ period: "2020-09" }))).status, 403);
  profile.role = "supervisor";
  assert.equal((await api.POST(request({ period: report.reportMonth() }))).status, 400);
  // Use an old month so this fixture has the same meaning whenever it runs.
  db.tables.tax_cases[0].created_at = "2020-09-20T02:00:00Z";
  db.tables.tax_case_progress_entries[0].created_at = "2020-09-25T02:00:00Z";
  const saved = await api.POST(request({ period: "2020-09" }));
  assert.equal(saved.status, 200);
  assert.equal(saved.body.report.cases[0].latest.text, "Original");
  db.tables.tax_case_progress_entries[0].entry = "Recently edited";
  assert.equal((await api.POST(request({ period: "2020-09" }))).body.report.cases[0].latest.text, "Original");
  assert.equal(db.tables.monthly_leadership_reports.length, 1);
});
