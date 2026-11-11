import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { clientImportPayload, validateClientImportRows } from "../lib/client-import.ts";
import { loadRoute, mockDatabase } from "./route-harness.ts";

function fixture(rows: any[], role = "supervisor", denied = false) {
  const db = mockDatabase({ client_master: structuredClone(rows) });
  const route = loadRoute("app/api/clients/export/route.ts", {
    "next/server": { NextResponse: Response }, "xlsx": XLSX,
    "@/lib/access": {
      currentActor: async () => denied ? { error: "Unauthenticated", status: 401 } : { admin: db, profile: { role } },
      isLeadership: (value: string) => ["leader", "supervisor", "partner", "admin"].includes(value)
    }
  });
  return { db, route };
}

async function workbook(route: any) {
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /spreadsheetml/);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const book = XLSX.read(await response.arrayBuffer(), { type: "array", cellStyles: true });
  return book.Sheets["Client Master"];
}

test("Excel export distinguishes all engagement categories independently of lifecycle status and preserves reference fields", async () => {
  const rows = [
    { client_code: "CL-001", legal_name: "Contract Client", status: "Active", engagement_type: "contract" },
    { client_code: "CL-002", legal_name: "Free Client", status: "Active", engagement_type: "free_of_charge", monthly_fee: 1000000, npwp: "0012345678901234" },
    { client_code: "CL-003", legal_name: "Annual Client", status: "Active", engagement_type: "on_demand" },
    { client_code: "CL-004", legal_name: "Archived Free Client", status: "Inactive", engagement_type: "free_of_charge" },
    { client_code: "CL-005", legal_name: "Legacy Client", status: "Active" }
  ];
  const d = fixture(rows), sheet = await workbook(d.route);
  const exported = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
  assert.deepEqual(exported.map(row => row.engagementType), ["Contract", "Free of Charge", "On Demand", "Free of Charge", "Contract"]);
  assert.equal(exported[3].clientStatus, "Inactive");
  assert.equal(exported[1].monthlyFee, 1000000); assert.equal(exported[1].npwp, "0012345678901234");
  assert.deepEqual(d.db.tables.client_master, rows, "export never changes stored categories/fees");
  const headers = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 })[0];
  assert.equal(headers[headers.indexOf("clientStatus") + 1], "engagementType");
  assert.equal(sheet["!autofilter"]?.ref, sheet["!ref"]);
  assert.ok(sheet["!cols"]![headers.indexOf("engagementType")].wch! >= 18);
});

test("empty master still exports category headers and a valid filter range", async () => {
  const sheet = await workbook(fixture([]).route);
  const headers = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 })[0];
  assert.ok(headers.includes("engagementType"));
  assert.equal(sheet["!autofilter"]?.ref, sheet["!ref"]);
  assert.equal(XLSX.utils.sheet_to_json(sheet).length, 0);
});

test("category labels survive pagination beyond 500 records", async () => {
  const rows = Array.from({ length: 501 }, (_, index) => ({ client_code: `CL-${index}`, legal_name: `Client ${index}`, engagement_type: index === 500 ? "on_demand" : "free_of_charge" }));
  const sheet = await workbook(fixture(rows).route), exported = XLSX.utils.sheet_to_json<any>(sheet);
  assert.equal(exported.length, 501);
  assert.equal(exported[500].engagementType, "On Demand");
  assert.equal(exported[499].engagementType, "Free of Charge");
});

test("export access checks remain enforced and database failures never return a partial workbook", async () => {
  assert.equal((await fixture([], "staff").route.GET()).status, 403);
  assert.equal((await fixture([], "supervisor", true).route.GET()).status, 401);
  const d = fixture([]);
  d.db.from = (() => ({ select() { return this; }, order() { return this; }, range: async () => ({ data: null, error: { message: "Read failed" } }) })) as any;
  const response = await d.route.GET();
  assert.equal(response.status, 500); assert.match((await response.json()).error, /Read failed/);
});

test("reimporting the exported category is reference-only and cannot reclassify clients", () => {
  for (const engagementType of ["Contract", "Free of Charge", "On Demand"]) {
    const row = { clientCode: "CL-001", name: "Existing Client", engagementType };
    assert.deepEqual(validateClientImportRows([row])[0].errors, []);
    const payload = clientImportPayload(row, { client_code: "CL-001", legal_name: "Existing Client", engagement_type: "contract" });
    assert.equal(Object.hasOwn(payload, "engagement_type"), false);
  }
});
