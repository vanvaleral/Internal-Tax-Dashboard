import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNpwp, validateClientImportRows } from "../lib/client-import.ts";

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
