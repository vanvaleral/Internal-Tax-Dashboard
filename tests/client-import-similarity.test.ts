import assert from "node:assert/strict";
import test from "node:test";
import * as imports from "../lib/client-import.ts";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";

const master = (id = "dream", name = "Bali Dream", extra = {}) => ({ id, client_code: `CL-${id}`, legal_name: name, company_form: "PT", status: "Active", engagement_type: "contract", updated_at: "2026-11-01T00:00:00Z", ...extra });

test("similar-name suggestions handle typos, transposition, spacing, word order and parenthesized contacts", () => {
  const records = [master(), master("other", "Surya Abadi"), master("creative", "Sajanna Creative (Andrew White)", { company_form: "CV" })];
  for (const name of ["PT BALI DREEM", "P.T. Bali Dream", "Bali Draem", "BaliDream", "Dream Bali"]) {
    assert.equal(imports.findSimilarClientNames({ name, businessForm: "PT" }, records)[0]?.clientId, "dream", name);
  }
  assert.equal(imports.findSimilarClientNames({ name: "CV Sajanna Creative" }, records)[0]?.clientId, "creative");
  assert.equal(imports.findSimilarClientNames({ name: "Completely Different" }, records).length, 0);
  assert.equal(imports.findSimilarClientNames({ name: "Ari" }, [master("short", "Adi")]).length, 0, "short personal names must not be loosely matched");
});

test("candidate identity conflicts are warnings, results are bounded and inactive records are visible", () => {
  const records = Array.from({ length: 8 }, (_, i) => master(`${i}`, "Bali Dream", { status: i === 0 ? "Inactive" : "Active", company_form: i === 1 ? "CV" : "PT", npwp: i === 2 ? "123456789012345" : null }));
  const result = imports.findSimilarClientNames({ name: "PT Bali Dreem", npwp: "987654321098765" }, records);
  assert.equal(result.length, 5); assert.equal(result[0].status, "Inactive");
  assert.match(result[1].conflicts.join(" "), /company form/);
  assert.match(result[2].conflicts.join(" "), /NPWP/);
  assert.equal(Object.hasOwn(result[2], "npwp"), false, "do not send stored tax IDs in suggestions");
  assert.deepEqual(records.map(row => row.legal_name), Array(8).fill("Bali Dream"), "finding candidates cannot mutate masters");
});

function fixture(records = [master()]) {
  const db = mockDatabase({ staff_profiles: [], client_master: records });
  const calls: any[] = [];
  let failCatalog = false, commitConflict = false, wrongTarget = false, changedVersion = false;
  const originalFrom = db.from.bind(db);
  db.from = (table: string) => {
    if (table === "client_master" && failCatalog) return { select() { return this; }, order() { return this; }, range: async () => ({ data: null, error: { message: "offline" } }) } as any;
    return originalFrom(table);
  };
  db.rpc = async (name, args) => {
    calls.push({ name, args: structuredClone(args) });
    if (name === "match_client_master_import") {
      const seen = new Set();
      return { data: { matches: args.p_rows.map((row: any, index: number) => {
        const target = records.find(client => client.client_code === row.client_code);
        const errors = !target && !row.client_code ? ["A new client needs a client code."] : [];
        if (target && seen.has(target.id)) errors.push("Multiple file rows would update the same client.");
        if (target) seen.add(target.id);
        return { row: index + 2, action: target ? "update" : "create", matchedBy: target ? "code" : null, clientId: target ? wrongTarget ? "foreign" : target.id : null, clientCode: target?.client_code || row.client_code, updatedAt: target ? changedVersion ? "v2" : target.updated_at : null, errors };
      }) }, error: null };
    }
    return { data: { data: [], created: 0, updated: 1 }, error: commitConflict ? { code: "40001", message: "Client records changed since preview" } : null };
  };
  const route = loadRoute("app/api/clients/route.ts", {
    "@/lib/client-import": imports,
    "@/lib/access": { currentActor: async () => ({ admin: db, profile: { id: "actor", role: "supervisor" }, userId: "user" }), isLeadership: () => true, canImportClientMaster: () => true },
    "@/lib/notifications": {}, "@/lib/workspace-reads": {}
  });
  return { route, calls, failCatalog: () => { failCatalog = true; }, conflict: () => { commitConflict = true; }, wrongTarget: () => { wrongTarget = true; }, changedVersion: () => { changedVersion = true; } };
}

test("new-name previews suggest without selecting, and the API blocks unreviewed or forged choices", async () => {
  const d = fixture(), clients = [{ clientCode: "FILE-NEW", name: "PT Bali Dreem" }];
  const preview = await d.route.POST(request({ operation: "validate-import", clients }));
  assert.equal(preview.body.matches[0].action, "create"); assert.equal(preview.body.summary.reviewRequired, 1);
  assert.equal(preview.body.similarNames[0].choice, ""); assert.equal(preview.body.similarNames[0].candidates[0].clientId, "dream");
  assert.equal((await d.route.POST(request({ operation: "bulk-import", clients, expectedMatches: preview.body.matches }))).status, 422);
  assert.equal((await d.route.POST(request({ operation: "bulk-import", clients, expectedMatches: preview.body.matches, nameChoices: { 2: "not-a-candidate" } }))).status, 422);
  assert.equal(d.calls.filter(call => call.name.startsWith("commit")).length, 0);
});

test("chosen existing clients keep canonical names and omitted fields, and still use the guarded commit", async () => {
  const d = fixture(), clients = [{ name: "PT Bali Dreem", monthlyFee: "2500000" }], nameChoices = { 2: "dream" };
  const input = structuredClone(clients);
  const preview = await d.route.POST(request({ operation: "validate-import", clients, nameChoices }));
  assert.equal(preview.body.summary.invalid, 0); assert.equal(preview.body.summary.reviewRequired, 0);
  assert.equal(preview.body.summary.updated, 1);
  const saved = await d.route.POST(request({ operation: "bulk-import", clients, nameChoices, expectedMatches: preview.body.matches }));
  assert.equal(saved.status, 200);
  const commit = d.calls.find(call => call.name === "commit_matched_client_import");
  assert.deepEqual(JSON.parse(JSON.stringify(commit.args.p_rows)), [{ legal_name: "Bali Dream", monthly_fee: 2500000, client_code: "CL-dream" }]);
  assert.deepEqual(clients, input, "raw upload remains unchanged");
  assert.equal(commit.args.p_expected_matches[0].clientId, "dream");
  d.conflict();
  assert.equal((await d.route.POST(request({ operation: "bulk-import", clients, nameChoices, expectedMatches: preview.body.matches }))).status, 409);
});

test("explicit separate-client choices preserve the upload and exact matches cannot be overridden", async () => {
  const d = fixture(), clients = [{ clientCode: "NEW", name: "Bali Dreem" }];
  const preview = await d.route.POST(request({ operation: "validate-import", clients, nameChoices: { 2: "new" } }));
  assert.equal(preview.body.summary.reviewRequired, 0); assert.equal(preview.body.summary.created, 1);
  await d.route.POST(request({ operation: "bulk-import", clients, nameChoices: { 2: "new" }, expectedMatches: preview.body.matches }));
  assert.equal(d.calls.find(call => call.name.startsWith("commit")).args.p_rows[0].legal_name, "Bali Dreem");
  const exact = await d.route.POST(request({ operation: "validate-import", clients: [{ clientCode: "CL-dream", name: "Bali Dream" }] }));
  assert.deepEqual(JSON.parse(JSON.stringify(exact.body.similarNames)), []);
  const override = await d.route.POST(request({ operation: "bulk-import", clients: [{ clientCode: "CL-dream", name: "Bali Dream" }], nameChoices: { 2: "new" }, expectedMatches: exact.body.matches }));
  assert.equal(override.status, 422);
});

test("form/NPWP conflicts and two rows selecting one client block the entire import", async () => {
  for (const extra of [{ businessForm: "CV" }, { npwp: "987654321098765" }]) {
    const d = fixture([master("dream", "Bali Dream", { npwp: "123456789012345" })]);
    const result = await d.route.POST(request({ operation: "bulk-import", clients: [{ clientCode: "NEW", name: "Bali Dreem", ...extra }], nameChoices: { 2: "dream" }, expectedMatches: [] }));
    assert.equal(result.status, 422); assert.equal(d.calls.some(call => call.name.startsWith("commit")), false);
  }
  const d = fixture();
  const result = await d.route.POST(request({ operation: "bulk-import", clients: [{ clientCode: "A", name: "Bali Dreem" }, { clientCode: "B", name: "Bali Draem" }], nameChoices: { 2: "dream", 3: "dream" }, expectedMatches: [] }));
  assert.equal(result.status, 422); assert.match(result.body.validation[1].errors.join(" "), /same client/);
  assert.equal(d.calls.some(call => call.name.startsWith("commit")), false);
});

test("name review pages past the API row limit and fails closed when the directory cannot load", async () => {
  const records = [...Array.from({ length: 1000 }, (_, i) => master(`other-${i}`, `Unrelated Company ${i}`)), master()];
  const d = fixture(records), body = { operation: "validate-import", clients: [{ clientCode: "NEW", name: "Bali Dreem" }] };
  assert.equal((await d.route.POST(request(body))).body.similarNames[0].candidates[0].clientId, "dream");
  d.failCatalog();
  assert.equal((await d.route.POST(request(body))).status, 503);
  assert.equal(d.calls.some(call => call.name.startsWith("commit")), false);
});

test("a reassigned code or renamed master during review cannot redirect a chosen update or overwrite the new name", async () => {
  for (const race of ["wrongTarget", "changedVersion"] as const) {
    const d = fixture(); d[race]();
    const result = await d.route.POST(request({ operation: "bulk-import", clients: [{ name: "Bali Dreem" }], nameChoices: { 2: "dream" }, expectedMatches: [] }));
    assert.equal(result.status, 422); assert.match(result.body.validation[0].errors.join(" "), /changed during name review/);
    assert.equal(d.calls.some(call => call.name.startsWith("commit")), false);
  }
});
