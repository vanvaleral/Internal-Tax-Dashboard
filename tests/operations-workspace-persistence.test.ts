import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/operations/route.ts", import.meta.url), "utf8");

test("monthly workspace updates merge PIC-scoped period payloads instead of replacing shared state", () => {
  assert.match(route, /function mergeMonthlyPayload/);
  assert.match(route, /const retainedRows = existingRows\.filter/);
  assert.match(route, /if \(scope === "monthly_compliance"\) payload = mergeMonthlyPayload/);
  assert.match(route, /scope !== "monthly_compliance"/);
});

test("monthly generation is server-side, PIC-scoped, and preserves snapshot ownership", () => {
  assert.match(route, /"preview-monthly-period", "generate-monthly-period"/);
  assert.match(route, /\.eq\("tax_pic_profile_id", actor\.profile\.id\)/);
  assert.match(route, /taxPicSnapshotProfileId: client\.tax_pic_profile_id/);
  assert.match(route, /accountingPicSnapshotProfileId: client\.accounting_pic_profile_id/);
  assert.match(route, /filterMonthlyPayload\(row\.payload, actor\.profile\.id, allowed\)/);
  assert.match(route, /\.eq\("version", current\.version\)/);
});
