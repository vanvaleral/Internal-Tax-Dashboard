import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { defaultFeaturePolicy, hasDelegatedOversight, requestAccessError } from "../lib/feature-access.ts";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";

test("a delegated Associate can open only the granted read-only views and maintenance remains blocking", () => {
  const policy = defaultFeaturePolicy();
  const profile = { role: "staff", allocation_overview_allowed: true, client_overview_allowed: false };
  assert.equal(hasDelegatedOversight(profile, policy, "allocation"), true);
  assert.equal(hasDelegatedOversight(profile, policy, "clients"), false);
  assert.ok(requestAccessError(profile.role, policy, "/api/clients/allocation", "POST"));
  policy.associate.allocation.mode = "maintenance";
  assert.equal(hasDelegatedOversight(profile, policy, "allocation"), false);
  assert.equal(hasDelegatedOversight({ ...profile, role: "leader" }, defaultFeaturePolicy(), "allocation"), false);
});

test("oversight rechecks permissions, paginates, and excludes fees, private details, proposals and deleted rows", async () => {
  const policy = defaultFeaturePolicy();
  const profile = { role: "staff", allocation_overview_allowed: true, client_overview_allowed: false };
  const clients = Array.from({ length: 504 }, (_, i) => ({
    id: String(i), client_code: String(i), legal_name: "Client " + i, status: i < 501 ? "Active" : i === 501 ? "Inactive" : i === 502 ? "Deleted" : "Proposal",
    monthly_fee: 3000, npwp: "private", notes: "private", tax_pic_name: "PIC", company_form: "PT"
  }));
  const admin = mockDatabase({ feature_access_settings: [{ id: true, policy, version: 1 }], client_master: clients });
  const route = loadRoute("app/api/staff-oversight/route.ts", {
    "@/lib/access": { currentActor: async () => ({ profile, admin }) }
  });
  const get = (scope: string) => route.GET(request({}, "?scope=" + scope));
  assert.equal((await get("clients")).status, 403);
  assert.equal((await get("unknown")).status, 400);
  const result = await get("allocation");
  assert.equal(result.status, 200);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.equal(result.body.rows.length, 501);
  assert.deepEqual(Object.keys(result.body.rows[0]).sort(), ["accountingPic","code","engagement","form","name","status","taxPic"]);
  profile.client_overview_allowed = true;
  assert.equal((await get("clients")).body.rows.length, 502);
  policy.associate.clients = { mode: "maintenance", message: "Under maintenance." };
  assert.equal((await get("clients")).status, 403);
  profile.allocation_overview_allowed = false;
  assert.equal((await get("allocation")).status, 403);
});

test("a read-only grant reveals Allocation without enabling the regular feature", () => {
  const dom = new JSDOM('<button class="nav-btn" data-view="allocation-view" hidden>Allocation</button>', { runScripts: "outside-only" });
  const w = dom.window as any;
  try {
    w.structuredClone = structuredClone;
    w.eval(readFileSync(new URL("../public/feature-access.js", import.meta.url), "utf8"));
    const policy = defaultFeaturePolicy();
    const profile = { allocation_overview_allowed: true };
    const config = { settings: { policy, ready: true, version: 1 }, role: "staff", profile, offline: false };
    w.WorkspaceFeatures.init(config);
    w.WorkspaceFeatures.chrome("allocation-view");
    assert.equal(w.document.querySelector("button").hidden, false);
    assert.equal(w.WorkspaceFeatures.can("allocation"), false);
    assert.equal(w.WorkspaceFeatures.normalize("allocation-view"), "allocation-view");
    policy.associate.allocation = { mode: "maintenance", message: "Under maintenance." };
    w.WorkspaceFeatures.accept({ policy, ready: true, version: 2 }, "staff");
    assert.equal(w.WorkspaceFeatures.oversight("allocation"), false);
  } finally { w.close(); }
});
