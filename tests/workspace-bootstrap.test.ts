import assert from "node:assert/strict";
import test from "node:test";
import { loadRoute, mockDatabase } from "./route-harness.ts";
import * as security from "../lib/workspace-security.ts";
import * as annual from "../lib/annual-sheet.ts";

function fixture(role = "staff") {
  let authCalls = 0;
  let user: any = { id: "user-a" };
  const db = mockDatabase({
    staff_profiles: [{ id: "a", auth_user_id: "user-a", full_name: "PIC A", directory_active: true, role, team_division: "Tax Team" }, { id: "b", full_name: "PIC B", directory_active: false, role: "staff" }],
    client_master: [{ id: "client-a", legal_name: "Assigned client", tax_pic_profile_id: "a", monthly_fee: 123, annual_fee: 456, fee_notes: "private" }, { id: "client-b", legal_name: "Other client", tax_pic_profile_id: "b", monthly_fee: 999 }],
    tax_cases: [{ id: "case-a", tax_pic_profile_id: "a", deleted_at: null }, { id: "case-b", tax_pic_profile_id: "b", deleted_at: null }, { id: "case-deleted", tax_pic_profile_id: "a", deleted_at: "2026-01-01" }],
    my_work_tasks: [{ id: "own", created_by_profile_id: "a", created_at: "2026-10-01", title: "Owned task" }, { id: "assigned", created_by_profile_id: "b", created_at: "2026-10-02", title: "Assigned task" }, { id: "other", created_by_profile_id: "b", title: "Private task" }],
    my_work_task_assignees: [{ task_id: "assigned", staff_profile_id: "a" }],
    my_work_task_preferences: [{ task_id: "own", staff_profile_id: "a", favorite: true }],
    operational_workspace_state: [{ scope: "monthly_compliance", version: 3, payload: { "October 2026": [{ databaseId: "client-a", taxPicSnapshotProfileId: "a", serviceFee: 100 }, { databaseId: "client-b", taxPicSnapshotProfileId: "b" }] } }],
    annual_sheet_columns: []
  });
  const bindings: Record<string, any> = {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => { authCalls++; return { data: { user } }; } } }) },
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/staff-directory": { canImportClientMaster: () => false },
    "@/lib/workspace-security": security, "@/lib/annual-sheet": annual
  };
  bindings["@/lib/access"] = loadRoute("lib/access.ts", bindings);
  const route = loadRoute("app/api/workspace/bootstrap/route.ts", bindings);
  return { route, db, authCalls: () => authCalls, signOut: () => { user = null; } };
}
const request = (view: string, extra = "", user = "user-a") => new Request(`https://test.local/api/workspace/bootstrap?view=${view}${extra}`, { headers: { "x-workspace-user": user } });

test("startup authenticates once and preserves staff scoping, fee redaction, task assignments and preferences", async () => {
  const f = fixture();
  const result = await f.route.GET(request("my-work-view"));
  assert.equal(result.status, 200); assert.equal(f.authCalls(), 1);
  const packets = result.body.packets;
  assert.deepEqual(Array.from(packets["/api/clients"].data, (row: any) => row.id), ["client-a"]);
  assert.equal(JSON.stringify(packets).includes("monthly_fee"), false);
  assert.equal(JSON.stringify(packets).includes("fee_notes"), false);
  assert.deepEqual(Array.from(packets["/api/cases"].data, (row: any) => row.id), ["case-a"]);
  assert.deepEqual(Array.from(packets["/api/my-work"].tasks, (row: any) => row.id), ["assigned", "own"]);
  assert.equal(packets["/api/my-work"].tasks[1].favorite, true);
  assert.equal(packets["/api/staff"].staff.length, 1);
  assert.equal("auth_user_id" in packets["/api/staff"].staff[0], false);
  assert.match(result.headers["Cache-Control"], /private, no-store/);
  assert.match(result.headers["Server-Timing"], /auth;dur=/);
  assert.equal(result.headers.Vary, "Cookie");
  assert.equal("/api/operations?scope=monthly_compliance" in packets, false);
});

test("startup blocks signed-out, disabled and changed accounts without returning private packets", async () => {
  for (const mode of ["signed-out", "disabled", "changed"]) {
    const f = fixture();
    if (mode === "signed-out") f.signOut();
    if (mode === "disabled") f.db.tables.staff_profiles[0].directory_active = false;
    const result = await f.route.GET(request("my-work-view", "", mode === "changed" ? "other-user" : "user-a"));
    assert.equal(result.status, { "signed-out": 401, disabled: 403, changed: 409 }[mode]);
    assert.equal(result.body.packets, undefined);
  }
  const fresh = fixture();
  assert.equal((await fresh.route.GET(request("cases-view"))).status, 200);
  fresh.db.tables.staff_profiles[0].directory_active = false;
  assert.equal((await fresh.route.GET(request("cases-view"))).status, 403, "a new request must recheck current staff access");
  assert.equal(fresh.authCalls(), 2);
});

test("startup monthly snapshots retain historical ownership and hide other PICs and fees", async () => {
  const f = fixture();
  f.db.tables.client_master[0].tax_pic_profile_id = "new-pic";
  const result = await f.route.GET(request("matrix-view"));
  const rows = result.body.packets["/api/operations?scope=monthly_compliance"].data[0].payload["October 2026"];
  assert.equal(rows.length, 1); assert.equal(rows[0].databaseId, "client-a");
  assert.equal(rows[0].serviceFee, undefined);
});

test("startup only reads the chosen menu and annual team, and paginates client master", async () => {
  const f = fixture("supervisor");
  f.db.tables.client_master = Array.from({ length: 601 }, (_, i) => ({ id: `client-${i}`, legal_name: `Client ${i}` }));
  const clients = await f.route.GET(request("client-management-view"));
  assert.equal(clients.body.packets["/api/clients"].data.length, 601);
  assert.deepEqual(Object.keys(clients.body.packets).sort(), ["/api/clients", "/api/staff"]);
  for (const team of ["accounting", "tax"]) {
    const result = await f.route.GET(request("matrix-view", `&mode=annual&team=${team}`));
    assert.equal(result.body.packets[`annual:${team}`].team, team);
    assert.equal(result.body.packets[`annual:${team}`].userId, "user-a");
    assert.equal(result.body.packets["/api/operations?scope=monthly_compliance"], undefined);
    assert.equal(result.body.packets[`annual:${team === "tax" ? "accounting" : "tax"}`], undefined);
  }
});

test("required startup reads launch together", async () => {
  let release!: () => void;
  const pending = new Promise(resolve => { release = () => resolve({ data: [] }); });
  const started: string[] = [];
  const route = loadRoute("app/api/workspace/bootstrap/route.ts", {
    "@/lib/access": { currentActor: async () => ({ userId: "u", profile: { id: "p" }, admin: {} }) },
    "@/lib/workspace-reads": {
      readStaff: async () => { started.push("staff"); return { staff: [] }; },
      readClients: () => { started.push("clients"); return pending; },
      readCases: async () => { started.push("cases"); return { data: [] }; },
      readOperations: async () => { started.push("monthly"); return { data: [] }; }
    },
    "@/lib/my-work-read": { readMyWork: async () => { started.push("tasks"); return { tasks: [] }; } },
    "@/lib/annual-sheet-read": {}
  });
  const loading = route.GET(request("my-work-view"));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ["staff", "clients", "cases", "tasks"]);
  release(); assert.equal((await loading).status, 200);
});

test("a failed required reader returns no partial startup data", async () => {
  const route = loadRoute("app/api/workspace/bootstrap/route.ts", {
    "@/lib/access": { currentActor: async () => ({ userId: "u", profile: { id: "p" }, admin: {} }) },
    "@/lib/workspace-reads": {
      readStaff: async () => ({ staff: [] }), readClients: async () => ({ data: [{ name: "Must not be exposed" }] }),
      readCases: async () => { throw new Error("Simulated read failure"); }
    },
    "@/lib/my-work-read": {}, "@/lib/annual-sheet-read": {}
  });
  const result = await route.GET(request("cases-view"));
  assert.equal(result.status, 503);
  assert.equal(result.body.packets, undefined);
  assert.equal(JSON.stringify(result.body).includes("Must not be exposed"), false);
});
