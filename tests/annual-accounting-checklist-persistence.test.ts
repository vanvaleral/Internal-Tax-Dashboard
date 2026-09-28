import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { mergeWorkspace, validateAnnualAccountingMonths } from "../lib/workspace-security.ts";

test("annual accounting accepts missing historical arrays and valid month selections", () => {
  assert.doesNotThrow(() => validateAnnualAccountingMonths({ clientName: "Legacy" }));
  const result = mergeWorkspace("annual_accounting", [{ clientName: "A" }], [{ clientName: "A", technicalAdminMonths: [0, 11], dataMonths: [0, 2], reportPreparationMonths: [] }], new Set(["A"]), "staff-a", false);
  assert.deepEqual(result[0].technicalAdminMonths, [0, 11]);
  assert.deepEqual(result[0].dataMonths, [0, 2]);
  assert.deepEqual(result[0].reportPreparationMonths, []);
});

test("annual accounting rejects malformed month arrays before database write", () => {
  for (const value of [[12], [-1], [0, 0], ["1"], [1.5], null, "January"]) {
    assert.throws(() => validateAnnualAccountingMonths({ dataMonths: value }), /Invalid dataMonths/);
  }
  assert.throws(() => mergeWorkspace("annual_accounting", [], [{ clientName: "A", technicalAdminMonths: [12] }], new Set(), "leader", true), /Invalid technicalAdminMonths/);
});

test("migration constrains all three fields without rewriting annual history", () => {
  const migration = readFileSync(new URL("../supabase/migrations/202609260002_annual_accounting_month_checklists.sql", import.meta.url), "utf8");
  for (const field of ["technicalAdminMonths", "dataMonths", "reportPreparationMonths"]) assert.match(migration, new RegExp(field));
  assert.match(migration, /add constraint annual_accounting_month_checklists_valid/);
  assert.match(migration, /not valid/);
  assert.doesNotMatch(migration, /update public\.operational_workspace_state/);
});
