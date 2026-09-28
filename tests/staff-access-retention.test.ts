import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("PIC Access separates archived staff and offers restoration", () => {
  const ui = read("public/demo.html");
  assert.match(ui, /data-staff-access-tab="deleted"/);
  assert.match(ui, /staff\.directory_active === false && !staff\.access_deleted_at/);
  assert.match(ui, /data-restore-staff=/);
  assert.match(ui, /14 \* 86400000/);
});

test("archiving records a deadline and restoration cannot race with deletion", () => {
  const route = read("app/api/staff/[id]/route.ts");
  assert.match(route, /directory_active: false, archived_at: new Date\(\)\.toISOString\(\)/);
  assert.match(route, /access_deletion_started_at", null/);
  assert.match(route, /archived_at\.gt\.\$\{restoreCutoff\}/);
  assert.match(route, /The 14-day restore window has expired/);
});

test("daily retention deletes Auth access but preserves historical staff profiles", () => {
  const migration = read("supabase/migrations/202609260001_staff_access_retention.sql");
  const maintenance = read("app/api/maintenance/purge-deleted/route.ts");
  const schedule = read("vercel.json");
  assert.match(migration, /access_deletion_started_at timestamptz/);
  assert.match(maintenance, /STAFF_ACCESS_RETENTION_DAYS = 14/);
  assert.match(maintenance, /auth\.admin\.deleteUser\(profile\.auth_user_id\)/);
  assert.match(maintenance, /auth_user_id: null, username: null, claim_code_hash: null/);
  assert.doesNotMatch(maintenance, /from\("staff_profiles"\)\.delete\(/);
  assert.match(schedule, /"path": "\/api\/maintenance\/purge-deleted"/);
});
