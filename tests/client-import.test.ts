import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { findDuplicateClientGroups, normalizeImportedDate, normalizeNpwp, validateClientImportRows } from "../lib/client-import.ts";

test("blank imported PICs remain unassigned through import, database mapping, and display", () => {
  const demo = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/clients/route.ts", import.meta.url), "utf8");
  assert.match(demo, /accountingPic: row\.accountingPic \|\| \(useDefaults \? ACC_PICS\[0\] : ""\)/);
  assert.match(demo, /ppn: row\.has_ppn\s*\}, \{ useDefaults: false \}\)/);
  assert.match(demo, /createClientFromRow\(row, \{ useDefaults: false \}\)/);
  assert.match(demo, /<option value="">No PIC yet<\/option>/);
  assert.match(route, /tax_pic_name: asSafeText\(client\.taxPic\) \|\| null, accounting_pic_name: asSafeText\(client\.accountingPic\) \|\| null/);
});

test("NPWP stays text-safe and only digits are normalized", () => {
  assert.equal(normalizeNpwp("12.345.678.9-012.345"), "123456789012345");
  assert.equal(normalizeNpwp("0012345678901234"), "0012345678901234");
});

test("client import validation rejects duplicates, invalid NPWP, and formulas", () => {
  const rows = [
    { clientCode: "CL-001", name: "Alpha", npwp: "123456789012345" },
    { clientCode: "cl-001", name: "Beta", npwp: "123", notes: "=HYPERLINK(\"https://bad.example\")" }
  ];
  const validation = validateClientImportRows(rows);
  assert.deepEqual(validation[0].errors, []);
  assert.match(validation[1].errors.join(" "), /Duplicate client code/);
  assert.match(validation[1].errors.join(" "), /NPWP/);
  assert.match(validation[1].errors.join(" "), /Excel formula/);
});

test("year-only contract dates are normalized while invalid dates are rejected", () => {
  assert.equal(normalizeImportedDate("2019"), "2019-01-01");
  assert.equal(normalizeImportedDate("31/12/2025"), "2025-12-31");
  assert.equal(normalizeImportedDate("2026-02-29"), null);
  const validation = validateClientImportRows([{ clientCode: "CL-002", name: "Beta", contractStartedAt: "2019", inactivatedAt: "not a date" }]);
  assert.doesNotMatch(validation[0].errors.join(" "), /contractStartedAt/);
  assert.match(validation[0].errors.join(" "), /inactivatedAt/);
});

test("client identity duplicate groups prefer NPWP and normalize Indonesian corporate forms", () => {
  const groups = findDuplicateClientGroups([
    { clientCode: "CL-010", name: "PT Example Indonesia", npwp: "12.345.678.9-012.345" },
    { clientCode: "CL-011", name: "Example Indonesia", npwp: "123456789012345" },
    { clientCode: "CL-012", name: "CV Beta Jaya", npwp: null },
    { clientCode: "CL-013", name: "Beta Jaya", npwp: null }
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.reason), ["NPWP", "name"]);
});
