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

test("Allocation sorting recognizes explicit empty PIC drafts as pending removals", () => {
  assert.ok(source);
  const state = { sorts:{ allocation:{ key:"status", dir:"asc" } }, allocationDrafts:{ first:{ nextAccPic:"" } } };
  const sort = vm.runInNewContext(`${source}; sortClientMasterRows`, {
    state, splitBusinessName:(client: any) => ({ name:client.name, form:"Individual" }),
    activeObligationKeys:() => [], compareText:(a: any, b: any) => String(a || "").localeCompare(String(b || ""))
  });
  const rows = [
    { id:"second", name:"Alpha", taxPic:"Bagus", accountingPic:"", serviceFee:0, annualFee:0 },
    { id:"first", name:"Beta", taxPic:"Bagus", accountingPic:"Ivan", serviceFee:0, annualFee:0 }
  ];
  assert.equal(sort(rows, "allocation")[0].id, "first");
});

test("Allocation entry order uses original creation dates, numeric code ties and keeps unknown dates last", () => {
  assert.ok(source);
  const state = { sorts:{ allocation:{ key:"createdAt", dir:"asc" } }, allocationDrafts:{} };
  const sort = vm.runInNewContext(`${source}; sortClientMasterRows`, {
    state, splitBusinessName:(client: any) => ({ name:client.name, form:client.form }),
    activeObligationKeys:() => [], compareText:(a: any, b: any) => String(a || "").localeCompare(String(b || ""))
  });
  const rows = [
    { id:"new", clientCode:"CL-3", name:"Alpha", form:"BUT", createdAt:"2026-10-20T08:00:00Z", updatedAt:"2026-10-20T08:00:00Z" },
    { id:"bulk10", clientCode:"CL-10", name:"Beta", form:"CV", createdAt:"2026-10-10T08:00:00Z", updatedAt:"2026-10-20T08:00:00Z" },
    { id:"missing", clientCode:"CL-20", name:"First alphabetically", form:"BUT", createdAt:"", updatedAt:"2026-09-01T08:00:00Z" },
    { id:"bulk2", clientCode:"CL-2", name:"Zulu", form:"PT", createdAt:"2026-10-10T16:00:00+08:00", updatedAt:"2026-10-29T08:00:00Z" },
    { id:"invalid", clientCode:"CL-21", name:"Invalid", form:"PT", createdAt:"unknown", updatedAt:"2026-01-01T00:00:00Z" }
  ];
  const original = rows.map(row => row.id).join(",");
  assert.equal(sort(rows, "allocation").map((row: any) => row.id).join(","), "bulk2,bulk10,new,missing,invalid");
  rows[3].updatedAt = "2026-12-31T00:00:00Z";
  assert.equal(sort(rows, "allocation")[0].id, "bulk2");
  state.sorts.allocation.dir = "desc";
  assert.equal(sort(rows, "allocation").map((row: any) => row.id).join(","), "new,bulk10,bulk2,invalid,missing");
  assert.equal(rows.map(row => row.id).join(","), original);
});
