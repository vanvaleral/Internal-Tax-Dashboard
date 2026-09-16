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

test("tax claim generation can update the non-blocking database status", () => {
  assert.match(demo, /function setDatabaseStatus\(status\)/);
  assert.match(demo, /function openMonthlyTaxClaim\(client\)/);
  assert.match(demo, /generateClaim\(client\);\s+saveMonthlyProgress\(\);\s+window\.open/);
});
