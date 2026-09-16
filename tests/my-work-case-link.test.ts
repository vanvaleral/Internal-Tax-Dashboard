import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/my-work/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202609160001_my_work_case_link.sql", import.meta.url), "utf8");
const progressMigration = readFileSync(new URL("../supabase/migrations/202609160002_tax_case_progress_entries.sql", import.meta.url), "utf8");
const demo = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");
const casesRoute = readFileSync(new URL("../app/api/cases/route.ts", import.meta.url), "utf8");

test("daily tasks persist an authorized optional Case link", () => {
  assert.match(migration, /add column if not exists case_id uuid references public\.tax_cases/);
  assert.match(route, /async function accessibleCaseId/);
  assert.match(route, /The selected Case is unavailable in your assigned scope/);
  assert.match(route, /case_id: caseId/);
  assert.match(route, /update\.case_id = await accessibleCaseId/);
});

test("My Work presents Case linking instead of repeat controls", () => {
  assert.match(demo, /data-my-work-case-select="\$\{selected\.id\}"/);
  assert.match(demo, /target\.matches\("\[data-my-work-case-select\]"\)/);
  assert.match(demo, /caseId: task\.caseId \|\| ""/);
  assert.doesNotMatch(demo, /data-open-my-work-menu="repeat"/);
});

test("Himbauan progress combines scoped completed tasks with an attributed direct progress log", () => {
  assert.match(progressMigration, /create table if not exists public\.tax_case_progress_entries/);
  assert.match(progressMigration, /created_by_profile_id uuid not null references public\.staff_profiles/);
  assert.match(casesRoute, /progressFor/);
  assert.match(casesRoute, /\.eq\("case_id", progressFor\)/);
  assert.match(casesRoute, /body\.action === "add-progress"/);
  assert.match(casesRoute, /You are not assigned to this case/);
  assert.match(demo, /data-toggle-himbauan-progress/);
  assert.match(demo, /class="case-progress-inline"/);
  assert.match(demo, /data-add-himbauan-progress/);
  assert.match(demo, /Completed My Work/);
});
