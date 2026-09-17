import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const demo = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");
const operationsRoute = readFileSync(new URL("../app/api/operations/route.ts", import.meta.url), "utf8");

test("monthly generation previews scoped rows before writing", () => {
  assert.match(demo, /action: "preview-monthly-period"/);
  assert.match(demo, /monthlyGenerationPreview/);
  assert.match(demo, /data-confirm-monthly-generation="yes"/);
  assert.match(demo, /class="generation-preview-table"/);
  assert.match(operationsRoute, /clients: candidates\.map/);
  assert.match(operationsRoute, /accountingPic: client\.accounting_pic_name/);
});

test("client editor resolves records from Client Master instead of a monthly snapshot", () => {
  assert.match(demo, /const managedClients = clientMasterClients/);
  assert.match(demo, /clientMasterClients\.find\(\(item\) => item\.id === editor\.id\)/);
  assert.match(demo, /if \(editClientTrigger\)[\s\S]*?state\.clientEditor = \{ kind: "client", id: state\.activeClientFormId \};\s+renderClientEditor\(\)/);
});

test("operations row expansion is navigation-only and does not save the workspace", () => {
  assert.match(demo, /function bindDirectRowActions\(\)/);
  assert.match(demo, /state\.expandedClientId = state\.expandedClientId === clientId \? "" : clientId;\s+state\.selectedClientId = clientId;\s+commitWorkspaceNavigation\("replace"\)/);
});

test("Operations starts its batched save well below one second", () => {
  assert.match(demo, /operationalSaveTimers\[scope\] = window\.setTimeout\([\s\S]*?}, 150\);/);
});

test("tax claim generation can update the non-blocking database status", () => {
  assert.match(demo, /function setDatabaseStatus\(status\)/);
  assert.match(demo, /function openMonthlyTaxClaim\(client\)/);
  assert.match(demo, /generateClaim\(client\);\s+saveMonthlyProgress\(\);[\s\S]*?claimWindow\.location\.replace/);
});

test("tax claim opens immediately and submits the latest payable values", () => {
  assert.match(demo, /const claimWindow = window\.open\("", "_blank"\)/);
  assert.match(demo, /obligations: client\.obligations/);
  assert.match(demo, /claimWindow\.location\.replace\(`/);
  assert.match(demo, /claimWindow\.name = JSON\.stringify\(\{ type: "monthly-tax-claim-bootstrap"/);
});

test("monthly Edit Mode supports selection and explicit permanent deletion", () => {
  assert.match(demo, /data-toggle-monthly-edit="yes">Edit Mode/);
  assert.match(demo, /data-select-all-monthly-rows="yes"/);
  assert.match(demo, /data-select-monthly-row=/);
  assert.match(demo, /method: "DELETE"/);
  assert.match(demo, /This action cannot be undone and the rows will not be moved to Recently Deleted/);
});

test("delete actions share the custom SVG trash icon", () => {
  assert.match(demo, /function deleteIcon\(\)/);
  assert.match(demo, /class="delete-icon"/);
  assert.doesNotMatch(demo, /&#128465;/);
  assert.match(demo, /data-delete-monthly-rows="yes"[\s\S]*?\$\{deleteIcon\(\)\}Delete/);
});
