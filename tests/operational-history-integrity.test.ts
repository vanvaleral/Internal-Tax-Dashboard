import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeWorkspace, scopedWorkspace } from "../lib/workspace-security.ts";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";

const migration = readFileSync(new URL("../supabase/migrations/202609270001_operational_history_integrity.sql", import.meta.url), "utf8");
const demo = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");
const claims = readFileSync(new URL("../app/api/monthly-claims/route.ts", import.meta.url), "utf8");
const claimTemplate = readFileSync(new URL("../public/tax-claim-template.html", import.meta.url), "utf8");
const clients = readFileSync(new URL("../app/api/clients/route.ts", import.meta.url), "utf8");

test("case trash no longer purges cases or cascades linked work", () => {
  const purge = migration.split("create or replace function public.purge_deleted_items()")[1].split("revoke all on function")[0];
  assert.doesNotMatch(purge, /delete from public\.tax_cases/i);
  assert.match(migration, /tax_case_assignment_events/);
  assert.match(migration, /old\.tax_pic_profile_id is distinct from new\.tax_pic_profile_id/);
});

test("client import and audit run in one service-role-only transaction", () => {
  assert.match(clients, /\.rpc\("commit_client_master_import"/);
  assert.doesNotMatch(clients, /from\("client_master_activity"\)\.insert/);
  assert.match(migration, /insert into public\.client_master_activity/);
  assert.match(migration, /insert into public\.client_import_batches/);
  assert.match(migration, /grant execute on function public\.commit_client_master_import\(jsonb, uuid, uuid, text, text, text\) to service_role/);
});

test("annual outside-contract work uses independent IDs and PIC scope", () => {
  const own = { id: "annual-acc-9", annualWorkId: "11111111-1111-4111-8111-111111111111", clientName: "Outside contract", accountingPicProfileId: "acc-1", taxPicProfileId: null, notes: "old" };
  const other = { ...own, id: "annual-acc-10", annualWorkId: "22222222-2222-4222-8222-222222222222", accountingPicProfileId: "acc-2" };
  assert.equal(scopedWorkspace("annual_accounting", [own, other], new Set(), "acc-1", false).length, 1);
  const merged = mergeWorkspace("annual_accounting", [own, other], [{ ...own, clientName: "Renamed", notes: "new" }], new Set(), "acc-1", false);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].clientName, "Renamed");
  assert.equal(merged[0].accountingPicProfileId, "acc-1");
  assert.throws(() => mergeWorkspace("annual_accounting", [own], [{ ...other, notes: "intrusion" }], new Set(), "acc-1", false));
  assert.throws(() => mergeWorkspace("annual_accounting", [], [{ ...own, taxPicProfileId: "another-pic" }], new Set(), "acc-1", false));
  assert.match(demo, /if \(row\.annualWorkId\) return;/);
});

test("annual work accepts a directory-backed PIC without creating a Client Master row", async () => {
  const db = mockDatabase({
    operational_workspace_state: [{ scope: "annual_accounting", version: 1, payload: [] }],
    client_master: [],
    staff_profiles: [{ id: "acc-1", display_name: "Cemari", full_name: "Cemari", directory_active: true }]
  });
  const route = loadRoute("app/api/operations/route.ts", {
    "@/lib/access": { currentActor: async () => ({ profile: { id: "supervisor", role: "supervisor" }, admin: db }), isLeadership: (role: string) => role === "supervisor" },
    "@/lib/workspace-security": await import("../lib/workspace-security.ts"),
    "@/lib/monthly-patch-validation": await import("../lib/monthly-patch-validation.ts")
  });
  const row = { id: "annual-acc-1", annualWorkId: "11111111-1111-4111-8111-111111111111", clientName: "Outside contract", accountingPic: "Cemari", accountingPicProfileId: "acc-1", taxPic: "", taxPicProfileId: null };
  const rejected = await route.PUT(request({ scope: "annual_accounting", version: 1, payload: [{ ...row, accountingPic: "Wrong" }] }));
  assert.equal(rejected.status, 400);
  const saved = await route.PUT(request({ scope: "annual_accounting", version: 1, payload: [row] }));
  assert.equal(saved.status, 200);
  assert.equal(db.tables.client_master.length, 0);
  assert.equal(db.tables.operational_workspace_state[0].payload[0].annualWorkId, row.annualWorkId);
});

test("claims are listed by ID, reopened without overwriting, and snapshotted before print", () => {
  assert.match(claims, /if \(existing\) return NextResponse\.json\(\{ data: existing/);
  assert.match(claims, /body\.action === "prepare-print"/);
  assert.match(claims, /\.rpc\("prepare_monthly_tax_claim_print"/);
  assert.match(migration, /select id, draft, p_actor_profile_id from public\.monthly_tax_claims/);
  assert.match(claims, /searchParams\.get\("list"\) === "1"/);
  assert.match(claims, /searchParams\.get\("printId"\)/);
  assert.match(demo, /data-open-saved-claim/);
  assert.match(demo, /data-open-claim-print/);
  assert.match(claimTemplate, /Saved print snapshot · read-only/);
  assert.match(migration, /create table if not exists public\.monthly_tax_claim_prints/);
});

test("case edit rejects stale versions without replacing its assigned PIC", async () => {
  const db = mockDatabase({
    tax_cases: [{ id: "case-uuid", client_id: "client-uuid", tax_pic_profile_id: "tax-old", accounting_pic_profile_id: "acc-old", tax_pic_name: "Old Tax", accounting_pic_name: "Old Acc", updated_at: "v1", deleted_at: null }],
    client_master: [{ id: "client-uuid", legal_name: "Client", tax_pic_profile_id: "tax-new", accounting_pic_profile_id: "acc-new", tax_pic_name: "New Tax", accounting_pic_name: "New Acc" }]
  });
  const route = loadRoute("app/api/cases/route.ts", {
    "@/lib/access": { currentActor: async () => ({ profile: { id: "supervisor", role: "supervisor" }, userId: "user", admin: db }), isLeadership: (role: string) => role === "supervisor" },
    "@/lib/notifications": {},
    "@/lib/operational-rules": { calculateHimbauanDueDate: () => null }
  });
  const stale = await route.PATCH(request({ id: "case-uuid", version: "old", case: { clientId: "client-uuid" } }));
  assert.equal(stale.status, 409);
  const saved = await route.PATCH(request({ id: "case-uuid", version: "v1", case: { clientId: "client-uuid" } }));
  assert.equal(saved.status, 200);
  assert.equal(db.tables.tax_cases[0].tax_pic_profile_id, "tax-old");
  assert.equal(db.tables.tax_cases[0].accounting_pic_profile_id, "acc-old");
});

test("only leadership can reassign an existing case to active staff", async () => {
  const db = mockDatabase({
    tax_cases: [{ id: "case-uuid", client_id: "client-uuid", tax_pic_profile_id: "tax-old", accounting_pic_profile_id: "acc-old", updated_at: "v1", deleted_at: null }],
    staff_profiles: [
      { id: "tax-new", full_name: "New Tax", team_division: "Tax Team", directory_active: true },
      { id: "acc-new", full_name: "New Acc", team_division: "Accounting Team", directory_active: true }
    ]
  });
  const bindings = (role: string, id: string) => ({
    "@/lib/access": { currentActor: async () => ({ profile: { id, role }, userId: "user", admin: db }), isLeadership: (value: string) => value === "supervisor" },
    "@/lib/notifications": {},
    "@/lib/operational-rules": { calculateHimbauanDueDate: () => null }
  });
  const body = { id: "case-uuid", version: "v1", action: "assign-pic", taxPicProfileId: "tax-new", accountingPicProfileId: "acc-new" };
  const staffRoute = loadRoute("app/api/cases/route.ts", bindings("staff", "tax-old"));
  assert.equal((await staffRoute.PATCH(request(body))).status, 403);
  const leaderRoute = loadRoute("app/api/cases/route.ts", bindings("supervisor", "supervisor"));
  assert.equal((await leaderRoute.PATCH(request(body))).status, 200);
  assert.equal(db.tables.tax_cases[0].tax_pic_profile_id, "tax-new");
  assert.equal(db.tables.tax_cases[0].accounting_pic_profile_id, "acc-new");
});
