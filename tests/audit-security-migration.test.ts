import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/202609160003_audit_security_and_recovery.sql", import.meta.url), "utf8");
const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
const myWork = readFileSync(new URL("../app/api/my-work/route.ts", import.meta.url), "utf8");

test("F04 archived staff are denied by middleware, server helpers, and restrictive RLS", () => {
  assert.match(middleware, /profile\?\.directory_active !== true/);
  assert.match(migration, /create policy active_staff_required[\s\S]+as restrictive/);
  assert.match(migration, /public\.active_staff_session\(\)/);
  assert.match(migration, /protect_staff_access_columns/);
});

test("F09 My Work creation has an idempotency key and updates have a version condition", () => {
  assert.match(migration, /client_request_id text/);
  assert.match(migration, /my_work_tasks_creation_request_idx/);
  assert.match(myWork, /client_request_id: requestId/);
  assert.match(myWork, /\.eq\("updated_at", body\.version\)/);
});

test("F10 purge atomically deletes expired recipient rows before their tombstones", () => {
  assert.match(migration, /create or replace function public\.purge_deleted_items/);
  assert.match(migration, /delete from public\.announcement_recipients/);
  assert.match(migration, /delete from public\.announcement_recipient_trash/);
  assert.ok(migration.indexOf("delete from public.announcement_recipients") < migration.indexOf("delete from public.announcement_recipient_trash"));
});
