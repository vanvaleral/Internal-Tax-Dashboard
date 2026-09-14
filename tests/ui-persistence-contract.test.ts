import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const demoPath = new URL("../public/demo.html", import.meta.url);

test("My Work uses a per-task save queue and avoids stale full-record replacement", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /const myWorkSaveQueues = new WeakMap\(\)/);
  assert.match(demo, /rapid create \+ edit sequence into POST then PATCH/);
  assert.doesNotMatch(demo, /Object\.assign\(task, result\.task\)/);
});

test("inline case edits are debounced and keep the table in place", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /const inlineCaseSaveQueues = new WeakMap\(\)/);
  assert.match(demo, /window\.setTimeout\(\(\) => \{/);
  assert.match(demo, /saveCaseToDatabase\(record, \{ showLoading: false \}\)/);
});

test("the client and case lists use windowed table rendering", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /function windowedRows\(rows, tableId, rowHeight\)/);
  assert.match(demo, /data-virtual-table="active-clients"/);
  assert.match(demo, /data-virtual-table="cases"/);
});
