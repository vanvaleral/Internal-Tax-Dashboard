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
