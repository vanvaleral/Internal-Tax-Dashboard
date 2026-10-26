import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";
import { mergeWorkspace } from "../lib/workspace-security.ts";

const demo = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");

test("annual controls show year selector and completion tabs, not the placeholder guide", () => {
  assert.match(demo, /id="annual-tax-year"/);
  assert.match(demo, /data-annual-status="incomplete"/);
  assert.match(demo, /data-annual-status="complete"/);
  assert.match(demo, /data-preview-annual-accounting/);
  assert.doesNotMatch(demo, /<strong>Annual mode<\/strong> = separate control sheet/);
});

test("annual bulk generation uses active ACC assignments and skips existing client-year work", async () => {
  const db = mockDatabase({
    client_master: [
      { id: "c1", client_code: "CL-1", legal_name: "Active One", company_form: "PT", status: "Active", accounting_pic_name: "Acc One", accounting_pic_profile_id: "acc1", tax_pic_name: "Tax One", tax_pic_profile_id: "tax1" },
      { id: "c2", client_code: "CL-2", legal_name: "Active Two", company_form: "CV", status: "Active", accounting_pic_name: "Acc Two", accounting_pic_profile_id: "acc2", tax_pic_name: "", tax_pic_profile_id: null },
      { id: "c3", client_code: "CL-3", legal_name: "Inactive", company_form: "PT", status: "Inactive", accounting_pic_name: "Acc One", accounting_pic_profile_id: "acc1" }
    ],
    operational_workspace_state: [{ scope: "annual_accounting", version: 1, payload: [{ id: "old", annualWorkId: "11111111-1111-4111-8111-111111111111", clientId: "c1", taxYear: 2025, accountingPicProfileId: "acc1" }] }],
    operational_workspace_audit: []
  });
  const route = loadRoute("app/api/operations/route.ts", {
    "@/lib/access": { currentActor: async () => ({ profile: { id: "acc1", role: "staff" }, admin: db }), isLeadership: () => false },
    "@/lib/workspace-security": await import("../lib/workspace-security.ts"),
    "@/lib/monthly-patch-validation": await import("../lib/monthly-patch-validation.ts")
  });
  const preview = await route.POST(request({ action: "preview-annual-accounting", year: 2026 }));
  assert.equal(preview.status, 200);
  assert.equal(preview.body.clients.length, 1);
  assert.equal(preview.body.clients[0].id, "c1");
  const generated = await route.POST(request({ action: "generate-annual-accounting", year: 2026 }));
  assert.equal(generated.status, 200);
  assert.equal(generated.body.created, 1);
  assert.equal(db.tables.operational_workspace_state[0].payload.length, 2);
  assert.equal(db.tables.operational_workspace_state[0].payload[1].accountingPicProfileId, "acc1");
  const repeated = await route.POST(request({ action: "generate-annual-accounting", year: 2026 }));
  assert.equal(repeated.body.created, 0);
  assert.equal(db.tables.operational_workspace_state[0].payload.length, 2);
});

test("staff-created annual tax subject keeps its own PIC identity", () => {
  const row = { id: "annual-tax-1", annualWorkId: "11111111-1111-4111-8111-111111111111", clientName: "Director", taxYear: 2026, taxPicProfileId: "tax1", taxPic: "Tax One" };
  const saved = mergeWorkspace("annual_tax", [], [row], new Set(), "tax1", false);
  assert.equal(saved[0].taxPicProfileId, "tax1");
  assert.throws(() => mergeWorkspace("annual_tax", [], [{ ...row, taxPicProfileId: "tax2" }], new Set(), "tax1", false));
});
