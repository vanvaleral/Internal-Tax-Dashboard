import assert from "node:assert/strict";
import test from "node:test";
import * as imports from "../lib/client-import.ts";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";

function fixture(role = "supervisor") {
  const db = mockDatabase({ staff_profiles: [{ id: "pic", full_name: "Ivan", display_name: "Ivan", directory_active: true }] });
  const calls: any[] = [];
  const match = { row: 2, action: "update", matchedBy: "name", clientId: "existing-id", clientCode: "CL-OLD", updatedAt: "2026-11-01T00:00:00Z", errors: [] as string[] };
  let failure: any = null;
  db.rpc = async (name, args) => {
    calls.push({ name, args });
    if (name === "match_client_master_import") return { data: { matches: [match] }, error: null };
    return { data: { data: [{ id: "existing-id", client_code: "CL-OLD" }], created: 0, updated: 1 }, error: failure };
  };
  const route = loadRoute("app/api/clients/route.ts", {
    "@/lib/client-import": imports,
    "@/lib/access": { currentActor: async () => ({ admin: db, profile: { id: "actor", role }, userId: "user" }), isLeadership: (value: string) => ["leader", "supervisor", "partner"].includes(value), canImportClientMaster: (value: string) => ["leader", "supervisor"].includes(value) },
    "@/lib/notifications": {}, "@/lib/workspace-reads": {}
  });
  return { route, calls, match, fail: (value: any) => { failure = value; } };
}

test("name-matched preview counts an update, including an omitted code", async () => {
  const d = fixture();
  const result = await d.route.POST(request({ operation: "validate-import", clients: [{ name: "Existing Client" }] }));
  assert.equal(result.status, 200);
  assert.equal(result.body.summary.updated, 1); assert.equal(result.body.summary.created, 0);
  assert.equal(result.body.matches[0].clientCode, "CL-OLD");
  assert.deepEqual(Object.keys(d.calls[0].args.p_rows[0]), ["legal_name"]);
});

test("partial import payload preserves missing fields but clears explicitly blank PICs", () => {
  const full = { legal_name: "Client", accounting_pic_name: null, accounting_pic_profile_id: null, tax_pic_name: "Keep", monthly_fee: 0, status: "Active", engagement_type: "contract" };
  assert.deepEqual(imports.clientImportPayload({ name: "Client", accountingPic: "" }, full), { legal_name: "Client", accounting_pic_name: null, accounting_pic_profile_id: null });
  assert.deepEqual(imports.clientImportPayload({ pph21: "yes", ppn: "false", monthlyFee: "" }, full), { monthly_fee: 0, has_pph21: true, has_ppn: false });
});

test("ambiguous matches block commit and count as invalid in preview", async () => {
  const d = fixture(); d.match.errors = ["Client name is ambiguous"];
  const body = { operation: "validate-import", clients: [{ name: "Existing Client" }] };
  const preview = await d.route.POST(request(body));
  assert.equal(preview.body.summary.invalid, 1); assert.equal(preview.body.summary.updated, 0);
  const commit = await d.route.POST(request({ ...body, operation: "bulk-import", expectedMatches: [d.match] }));
  assert.equal(commit.status, 422); assert.equal(d.calls.filter(call => call.name.startsWith("commit")).length, 0);
});

test("bulk import requires preview and uses guarded transactional commit", async () => {
  const d = fixture(), clients = [{ clientCode: "FILE-NEW", name: "Existing Client", accountingPic: "" }];
  const missing = await d.route.POST(request({ operation: "bulk-import", clients })); assert.equal(missing.status, 422);
  const result = await d.route.POST(request({ operation: "bulk-import", clients, expectedMatches: [d.match], fileName: "clients.xlsx" }));
  assert.equal(result.status, 200); assert.equal(result.body.updated, 1);
  const commit = d.calls.find(call => call.name === "commit_matched_client_import");
  assert.equal(commit.args.p_expected_matches[0].clientId, "existing-id");
  assert.equal(commit.args.p_rows[0].accounting_pic_profile_id, null);
  assert.equal(Object.hasOwn(commit.args.p_rows[0], "status"), false);
  assert.equal(Object.hasOwn(commit.args.p_rows[0], "engagement_type"), false);
});

test("changed preview returns conflict without a silent retry", async () => {
  const d = fixture(); d.fail({ code: "40001", message: "Client records changed since preview" });
  const result = await d.route.POST(request({ operation: "bulk-import", clients: [{ name: "Client" }], expectedMatches: [d.match] }));
  assert.equal(result.status, 409); assert.match(result.body.error, /changed since preview/);
  assert.equal(d.calls.filter(call => call.name === "commit_matched_client_import").length, 1);
});

test("manual saves retain the existing RPC and mandatory code", async () => {
  const d = fixture();
  assert.equal((await d.route.POST(request({ clients: [{ name: "Client" }] }))).status, 422);
  assert.equal((await d.route.POST(request({ clients: [{ clientCode: "CL-OLD", name: "Client" }] }))).status, 200);
  assert.equal(d.calls.length, 1); assert.equal(d.calls[0].name, "commit_client_master_import");
});

test("staff and partner cannot import; unrecognized PIC names cannot commit", async () => {
  for (const role of ["staff", "partner"]) {
    const d = fixture(role);
    assert.equal((await d.route.POST(request({ operation: "bulk-import", clients: [{ name: "Client" }] }))).status, 403);
    assert.equal(d.calls.length, 0);
  }
  const d = fixture();
  assert.equal((await d.route.POST(request({ operation: "bulk-import", clients: [{ name: "Client", accountingPic: "Nobody" }], expectedMatches: [d.match] }))).status, 422);
});

test("different corporate forms can coexist, while invalid statuses and fees are rejected", () => {
  const rows = [{ name: "PT Example", businessForm: "PT", clientCode: "A" }, { name: "CV Example", businessForm: "CV", clientCode: "B" }];
  assert.equal(imports.validateClientImportRows(rows).flatMap(row => row.errors).length, 0);
  assert.match(imports.validateClientImportRows([{ name: "X", clientCode: "C", clientStatus: "", monthlyFee: "Rp 1.000" }])[0].errors.join(" "), /clientStatus.*monthlyFee/);
});
