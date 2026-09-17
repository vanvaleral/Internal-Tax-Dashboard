import assert from "node:assert/strict";
import test from "node:test";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";
import * as security from "../lib/workspace-security.ts";

function fixture(role = "staff") {
  const profile = { id: role === "staff" ? "a" : "supervisor", role, full_name: "Synthetic User" };
  const a = { databaseId: "A", name: "Client A", taxPicSnapshotProfileId: "a", serviceFee: 100, notes: "", dataState: "missing", obligations: { pph21: { status: "awaiting", receiptNumber: "" } } };
  const b = { databaseId: "B", name: "Client B", taxPicSnapshotProfileId: "b", serviceFee: 999 };
  const db = mockDatabase({
    operational_workspace_state: [{ scope: "annual_tax", version: 1, payload: [a, b] }, { scope: "monthly_compliance", version: 1, payload: { "August 2026": [a, b] } }],
    client_master: [{ id: "A", client_code: "CL-001", legal_name: "Client A", tax_pic_profile_id: "a", status: "Active" }, { id: "B", client_code: "CL-002", legal_name: "Client B", tax_pic_profile_id: "b", status: "Active" }],
    staff_profiles: [{ id: "a", full_name: "Synthetic Tax", team_division: "Tax Team", directory_active: true }]
  });
  const route = loadRoute("app/api/operations/route.ts", { "@/lib/access": { currentActor: async () => ({ profile, admin: db }), isLeadership: (value: string) => value !== "staff" }, "@/lib/workspace-security": security });
  return { route, db, a, b };
}

test("F01 actual annual PUT preserves another PIC's records", async () => {
  const { route, db, a } = fixture();
  const response = await route.PUT(request({ scope: "annual_tax", version: 1, payload: [{ ...a, notes: "changed" }] }));
  assert.equal(response.status, 200);
  assert.equal(db.tables.operational_workspace_state[0].payload.length, 2);
  assert.equal(response.body.data.payload.length, 1);
  assert.equal(response.body.data.payload[0].serviceFee, undefined);
});

test("F02 GET, PUT and version-conflict responses never return another staff's client or fees", async () => {
  const { route, a } = fixture();
  const read = await route.GET(request());
  assert.equal(JSON.stringify(read.body).includes("Client B"), false);
  assert.equal(JSON.stringify(read.body).includes("serviceFee"), false);
  const saved = await route.PUT(request({ scope: "monthly_compliance", version: 1, payload: { "August 2026": [a] } }));
  assert.equal(JSON.stringify(saved.body).includes("Client B"), false);
  const conflict = await route.PUT(request({ scope: "annual_tax", version: 0, payload: [a] }));
  assert.equal(conflict.status, 409);
  assert.equal(JSON.stringify(conflict.body).includes("Client B"), false);
  assert.equal(JSON.stringify(conflict.body).includes("serviceFee"), false);
});

test("F03 stale monthly saves and atomic write races fail without overwriting newer state", async () => {
  const { route, db, a } = fixture();
  const body = { scope: "monthly_compliance", version: 0, payload: { "August 2026": [{ ...a, notes: "stale" }] } };
  assert.equal((await route.PUT(request(body))).status, 409);
  body.version = 1;
  db.beforeWrite = () => { db.tables.operational_workspace_state[1].version = 2; };
  assert.equal((await route.PUT(request(body))).status, 409);
  assert.equal(db.tables.operational_workspace_state[1].payload["August 2026"][0].notes, "");
});

test("F03 original PIC can save historical periods after client reassignment", async () => {
  const { route, db, a } = fixture();
  db.tables.client_master[0].tax_pic_profile_id = "new-pic";
  const saved = await route.PUT(request({ scope: "monthly_compliance", version: 1, payload: { "August 2026": [{ ...a, notes: "historical correction" }] } }));
  assert.equal(saved.status, 200);
  assert.equal(db.tables.operational_workspace_state[1].payload["August 2026"].length, 2);
  assert.equal(saved.body.data.payload["August 2026"][0].notes, "historical correction");
});

test("monthly row PATCH saves only the edited fields and preserves other clients", async () => {
  const { route, db } = fixture();
  const response = await route.PATCH(request({
    period: "August 2026",
    rowId: "A",
    changes: { dataState: "received", obligations: { pph21: { receiptNumber: "NTPN-123" } } }
  }));
  assert.equal(response.status, 200);
  const rows = db.tables.operational_workspace_state[1].payload["August 2026"];
  assert.equal(rows[0].dataState, "received");
  assert.equal(rows[0].obligations.pph21.receiptNumber, "NTPN-123");
  assert.equal(rows[0].serviceFee, 100);
  assert.equal(rows[1].name, "Client B");
});

test("F08 supervisor generating another PIC's month receives the generated queue", async () => {
  const { route, db } = fixture("supervisor");
  const response = await route.POST(request({ action: "generate-monthly-period", period: "2026-09", targetProfileId: "a" }));
  assert.equal(response.status, 200);
  assert.equal(response.body.created, 1);
  assert.equal(response.body.data.payload["September 2026"].length, 1);
  assert.equal(db.tables.operational_workspace_state[1].payload["September 2026"][0].taxPicSnapshotProfileId, "a");
});
