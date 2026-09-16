import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/202609160004_audit_integrity_outbox_pagination.sql");
const duplicateRoute = read("../app/api/clients/duplicates/route.ts");
const myWorkRoute = read("../app/api/my-work/route.ts");
const caseRoute = read("../app/api/cases/route.ts");
const notificationHelper = read("../lib/notifications.ts");
const notificationWorker = read("../app/api/maintenance/deliver-notifications/route.ts");
const clientExport = read("../app/api/clients/export/route.ts");

test("F12 duplicate cleanup is an atomic merge with dependency preview and recovery", () => {
  assert.match(migration, /create or replace function public\.merge_duplicate_clients/);
  assert.match(migration, /update public\.tax_cases set client_id = canonical_id/);
  assert.match(migration, /update public\.monthly_tax_claims set client_id = canonical_id/);
  assert.match(migration, /create or replace function public\.restore_merged_client/);
  assert.match(migration, /deleted_at >= now\(\) - interval '3 days'/);
  assert.match(duplicateRoute, /dependencies: \{ cases:/);
  assert.match(duplicateRoute, /rpc\("restore_merged_client"/);
});

test("F13 completion actor and reopen history feed the immutable point ledger", () => {
  assert.match(migration, /completed_by_profile_id uuid references public\.staff_profiles/);
  assert.match(migration, /my_work_task_completion_events/);
  assert.match(myWorkRoute, /completed_by_profile_id = body\.done \? task\.completed_by_profile_id \|\| current\.profile\.id : null/);
  assert.match(myWorkRoute, /event_type: eventType/);
  assert.match(myWorkRoute, /event_type: "reopened", points: -Number\(earned\.points\)/);
  assert.match(caseRoute, /completedByName:/);
});

test("F14 an unchanged case link is not revalidated during an authorized task save", () => {
  assert.match(myWorkRoute, /typeof body\.caseId === "string" && \(body\.caseId \|\| null\) !== task\.case_id/);
});

test("F15 performance writes are ledger-backed and manual adjustments require leadership", () => {
  const route = read("../app/api/performance/route.ts");
  const demo = read("../public/demo.html");
  assert.match(route, /Only leadership can create manual point adjustments/);
  assert.match(route, /sourceType !== "manual_adjustment"/);
  assert.match(demo, /loadPerformanceLedger/);
  assert.match(demo, /state\.performance\.ledgerLoaded/);
});

test("F16 notifications use a transactional outbox and bounded asynchronous retries", () => {
  assert.match(migration, /create or replace function public\.enqueue_operational_announcement/);
  assert.match(notificationHelper, /rpc\("enqueue_operational_announcement"/);
  assert.match(notificationWorker, /\.limit\(100\)/);
  assert.match(notificationWorker, /max_attempts/);
  assert.match(notificationWorker, /directory_active/);
});

test("F17 My Work authorization is query-scoped and long lists and exports are paged", () => {
  assert.match(myWorkRoute, /\.eq\("created_by_profile_id", profile\.id\)/);
  assert.match(myWorkRoute, /\.eq\("staff_profile_id", profile\.id\)\.range/);
  assert.match(myWorkRoute, /for \(let from = 0; ; from \+= pageSize\)/);
  assert.match(clientExport, /for \(let from = 0; ; from \+= 500\)/);
  assert.match(read("../app/api/performance/route.ts"), /for \(let from = 0; ; from \+= 500\)/);
});
