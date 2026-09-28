import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Script, runInNewContext } from "node:vm";

const demo = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");

test("annual planning demo keeps accounting candidates and tax subjects separate", () => {
  assert.match(demo, /annualPlanCandidates = activeClientMasterRecords\(\)\.filter/);
  assert.match(demo, /data-annual-plan-add-outside/);
  assert.match(demo, /data-annual-plan-add-subject/);
  assert.match(demo, /clientId, parentName: parent\?\.name/);
  assert.match(demo, /Preview only · not saved/);
  assert.match(demo, /data-annual-plan-toggle-month/);
  assert.match(demo, /data-annual-plan-toggle-milestone/);
  assert.match(demo, /data-annual-plan-expand/);
  assert.match(demo, /<details class="annual-legacy-sheet"/);
  assert.match(demo, /Current annual control/);
  assert.match(demo, /annualSource\.map\(\(row, index\) =>/);
});

test("annual planning changes leave the demo script syntactically valid", () => {
  const inlineScript = demo.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inlineScript);
  assert.doesNotThrow(() => new Script(inlineScript));
});

test("annual accounting rows expand inline with three compact 12-month checklists", () => {
  assert.match(demo, /class="annual-accounting-main" data-annual-accounting-toggle="\$\{row\.id\}"/);
  assert.match(demo, /class="expanded-row"><td colspan="14"/);
  assert.match(demo, /technicalAdminMonths/);
  assert.match(demo, /dataMonths/);
  assert.match(demo, /reportPreparationMonths/);
  assert.match(demo, /\["technicalAdminMonths", "Admin teknis"\], \["dataMonths", "Data"\], \["reportPreparationMonths", "Penyusunan"\]/);
  assert.match(demo, /class="annual-checklist-table"/);
  assert.match(demo, /Array\.from\(\{ length: 12 \}/);
  assert.match(demo, /data-annual-accounting-cell="\$\{row\.id\}\|\$\{field\}\|\$\{month\}"/);
  assert.match(demo, /document\.addEventListener\("pointermove"/);
  assert.match(demo, /Math\.min\(drag\.start, drag\.end\)/);
  assert.match(demo, /document\.addEventListener\("pointerup"/);
  assert.match(demo, /commitUi\("replace"\)/);
});

test("only the specified annual progress transitions complete their matching checklist", () => {
  const source = demo.match(/function annualAccountingAutoChecklist\(row, previous, next\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(source);
  const apply = runInNewContext(`${source}; annualAccountingAutoChecklist`);
  const row = { technicalAdminMonths: [0], dataMonths: [1], reportPreparationMonths: [2] };
  assert.equal(apply(row, "Data Request", "In Process").field, "dataMonths");
  assert.deepEqual(Array.from(row.dataMonths), Array.from({ length: 12 }, (_, month) => month));
  assert.deepEqual(row.technicalAdminMonths, [0]);
  assert.equal(apply(row, "In Process", "Financials Done").field, "reportPreparationMonths");
  assert.deepEqual(Array.from(row.reportPreparationMonths), Array.from({ length: 12 }, (_, month) => month));
  assert.equal(apply(row, "Equalization", "Review").field, "technicalAdminMonths");
  assert.deepEqual(Array.from(row.technicalAdminMonths), Array.from({ length: 12 }, (_, month) => month));
  assert.equal(apply(row, "Review", "Meeting"), null);
});
