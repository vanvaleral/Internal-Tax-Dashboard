import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";
import { notificationEventKey, uniqueProfileIds } from "../lib/operational-rules.ts";

function fixture(role = "staff", notificationMode = "delivered") {
  const db = mockDatabase({
    client_master: [{ id:"client-1", legal_name:"Synthetic client", tax_pic_profile_id:"tax-1", accounting_pic_profile_id:"acc-1" }],
    staff_profiles: [{ id:"tax-1", role:"staff", directory_active:true }, { id:"acc-1", role:"staff", directory_active:true }, { id:"boss", role:"supervisor", directory_active:true }, { id:"inactive", role:"partner", directory_active:false }, { id:"other", role:"staff", directory_active:true }],
    tax_cases: []
  });
  const calls: any[] = [];
  const route = loadRoute("app/api/cases/route.ts", {
    "@/lib/access": { currentActor:async () => ({ userId:"user-1", profile:{ id:"tax-1", role, full_name:"Synthetic Tax" }, admin:db }), isLeadership:(value: string) => ["leader", "supervisor", "partner", "admin"].includes(value) },
    "@/lib/operational-rules": { calculateHimbauanDueDate:() => "2026-11-20" },
    "@/lib/notifications": { notificationEventKey, uniqueProfileIds, createOperationalAnnouncement:async (input: any) => { calls.push(input); if (notificationMode === "failed") throw new Error("Simulated enqueue failure"); return { id:"announcement-1", queued:notificationMode === "queued" }; } }
  });
  return { db, calls, route };
}

test("new Himbauan and Pemeriksaan cases notify their PICs and active leadership with stable event identity", async () => {
  for (const category of ["Himbauan", "Pemeriksaan"]) {
    const f = fixture();
    const result = await f.route.POST(request({ case:{ clientId:"client-1", caseCategory:category } }));
    assert.equal(result.status, 201); assert.equal(result.body.announcementStatus, "delivered");
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].title, `New ${category}: Synthetic client`);
    assert.deepEqual(Array.from(f.calls[0].recipientProfileIds).sort(), ["acc-1", "boss", "tax-1"]);
    assert.equal(f.calls[0].sourceType, "tax_case"); assert.equal(f.calls[0].sourceId, result.body.data.id);
    assert.equal(f.calls[0].eventKey, `case:${result.body.data.id}:created`);
  }
});

test("notification failure is reported separately from a successfully created case", async () => {
  for (const status of ["failed", "queued"]) {
    const f = fixture("staff", status);
    const result = await f.route.POST(request({ case:{ clientId:"client-1", caseCategory:"Himbauan" } }));
    assert.equal(result.status, 201); assert.equal(result.body.announcementStatus, status);
    assert.equal(f.db.tables.tax_cases.length, 1); assert.equal(result.body.data.id, f.db.tables.tax_cases[0].id);
  }
});

test("unassigned staff cannot create a case or notify other clients' PICs", async () => {
  const f = fixture(); f.db.tables.client_master[0].tax_pic_profile_id = "other";
  const result = await f.route.POST(request({ case:{ clientId:"client-1" } }));
  assert.equal(result.status, 403); assert.equal(f.calls.length, 0); assert.equal(f.db.tables.tax_cases.length, 0);
});

test("the corrective outbox migration avoids column/local-variable collisions and retains restricted execution", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20261102094113_fix_announcement_outbox_variable_ambiguity.sql", import.meta.url), "utf8");
  assert.match(migration, /v_announcement_id uuid/);
  assert.doesNotMatch(migration, /^\s*announcement_id uuid/m);
  assert.match(migration, /select v_announcement_id, profile\.id/);
  assert.match(migration, /on conflict \(announcement_id, staff_profile_id, channel\) do nothing/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
  assert.doesNotMatch(migration, /delete from|drop table|update public\./i);
});
