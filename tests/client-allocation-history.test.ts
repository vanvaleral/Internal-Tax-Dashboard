import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const demo = fs.readFileSync(path.join(root, "public", "demo.html"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "clients", "allocation", "route.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "202609240002_client_pic_allocation_history.sql"), "utf8");

test("allocation history stores yearly before and after PIC identities", () => {
  assert.match(migration, /create table if not exists public\.client_pic_allocation_history/);
  assert.match(migration, /allocation_year integer not null/);
  for (const field of ["previous_tax_pic_profile_id", "next_tax_pic_profile_id", "previous_accounting_pic_profile_id", "next_accounting_pic_profile_id", "changed_by_profile_id"]) {
    assert.match(migration, new RegExp(field));
  }
});

test("allocation batch updates client master and history atomically", () => {
  assert.match(migration, /create or replace function public\.apply_client_pic_allocation_batch/);
  assert.match(migration, /insert into public\.client_pic_allocation_history/);
  assert.match(migration, /update public\.client_master set/);
  assert.match(migration, /'pic_allocation_changed'/);
  assert.match(migration, /grant execute on function public\.apply_client_pic_allocation_batch[\s\S]*to service_role/);
  assert.match(route, /actor\.admin\.rpc\("apply_client_pic_allocation_batch"/);
});

test("allocation API enforces leadership and permanent staff identity", () => {
  assert.match(route, /if \(!isLeadership\(actor\.profile\.role\)\)/);
  assert.match(route, /Tax PIC must match one active staff profile/);
  assert.match(route, /ACC PIC must match one active staff profile/);
  assert.match(route, /p_changed_by_profile_id: actor\.profile\.id/);
});

test("Allocation UI applies one year-tagged batch from Client Master", () => {
  assert.match(demo, /allocationYear: Number\(/);
  assert.match(demo, /id="allocation-year"/);
  assert.match(demo, /return \[\.\.\.clientMasterClients\]/);
  assert.match(demo, /fetch\("\/api\/clients\/allocation"|appFetch\("\/api\/clients\/allocation"/);
  assert.match(demo, /allocationYear: state\.allocationYear/);
  assert.doesNotMatch(demo, /Promise\.all\(report\.map\(\(change\) => saveClientToDatabase/);
});
