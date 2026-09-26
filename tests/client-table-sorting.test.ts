import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const demo = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");
const source = demo.match(/    function sortClientMasterRows\(rows, scope\) \{[\s\S]*?\n    \}\n\n    function compareDatesDisplay/)?.[0].replace(/\n\n    function compareDatesDisplay$/, "");

test("client and allocation sorting handles text, numbers, direction, and draft PICs", () => {
  assert.ok(source);
  const state = {
    sorts: { clients: { key: "monthlyFee", dir: "asc" }, allocation: { key: "nextTaxPic", dir: "asc" } },
    allocationDrafts: { "CL-2": { nextTaxPic: "Aaron" } }
  };
  const sort = vm.runInNewContext(`${source}; sortClientMasterRows`, {
    state,
    splitBusinessName: (client: { name: string; businessForm: string }) => ({ name: client.name, form: client.businessForm }),
    activeObligationKeys: (client: { obligations: string[] }) => client.obligations,
    compareText: (a: string, b: string) => String(a || "").localeCompare(String(b || ""), "id", { sensitivity: "base" })
  });
  const rows = [
    { id: "CL-1", clientCode: "CL-1", name: "Beta", businessForm: "PT", taxPic: "Zara", accountingPic: "Dina", serviceFee: 100, annualFee: 1200, obligations: [] },
    { id: "CL-2", clientCode: "CL-2", name: "Alpha", businessForm: "CV", taxPic: "Zara", accountingPic: "Ivan", serviceFee: 20, annualFee: 240, obligations: [] }
  ];
  assert.equal(sort(rows, "clients").map((row: { id: string }) => row.id).join(","), "CL-2,CL-1");
  state.sorts.clients.dir = "desc";
  assert.equal(sort(rows, "clients").map((row: { id: string }) => row.id).join(","), "CL-1,CL-2");
  state.sorts.clients = { key: "name", dir: "asc" };
  assert.equal(sort(rows, "clients").map((row: { id: string }) => row.id).join(","), "CL-2,CL-1");
  assert.equal(sort(rows, "allocation").map((row: { id: string }) => row.id).join(","), "CL-2,CL-1");
});

test("both tables expose clickable sort controls without sorting the numbering column", () => {
  assert.match(demo, /sortHeader\("clients", "monthlyFee", "Monthly Fee"\)/);
  assert.match(demo, /sortHeader\("clients", "accPic", "ACC"\)/);
  assert.match(demo, /sortHeader\("allocation", "nextTaxPic", "Next TAX PIC"\)/);
  assert.match(demo, /sortHeader\("allocation", "status", "Status"\)/);
  assert.match(demo, /const activeClientRows = sortClientMasterRows\(\[\.\.\.managedClients\]\.filter/);
  assert.match(demo, /return sortClientMasterRows\(activeClientMasterRecords\(\)/);
});
