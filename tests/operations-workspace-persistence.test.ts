import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeWorkspace, scopedWorkspace } from "../lib/workspace-security.ts";

const route = readFileSync(new URL("../app/api/operations/route.ts", import.meta.url), "utf8");

test("monthly workspace updates merge PIC-scoped period payloads instead of replacing shared state", () => {
  const rows = [{ databaseId: "A", taxPicSnapshotProfileId: "staff-a", notes: "old" }, { databaseId: "B", taxPicSnapshotProfileId: "staff-b", notes: "other" }];
  const merged = mergeWorkspace("monthly_compliance", { July: rows }, { July: [{ ...rows[0], notes: "new" }] }, new Set(["A"]), "staff-a", false);
  assert.equal(merged.July.length, 2);
  assert.equal(merged.July[0].notes, "new");
  assert.equal(merged.July[1].notes, "other");
  const history = mergeWorkspace("monthly_compliance", merged, { July: [] }, new Set(), "staff-a", false);
  assert.deepEqual(history, merged);
});

test("monthly generation is server-side, target-PIC scoped, and preserves snapshot ownership", () => {
  assert.match(route, /"preview-monthly-period", "generate-monthly-period"/);
  assert.match(route, /const targetProfileId = requestedProfileId \|\| actor\.profile\.id/);
  assert.match(route, /Only leadership can generate a month for another Tax PIC/);
  assert.match(route, /targetProfile\.team_division !== "Tax Team"/);
  assert.match(route, /\.eq\("tax_pic_profile_id", targetProfileId\)/);
  assert.match(route, /taxPicSnapshotProfileId: client\.tax_pic_profile_id/);
  assert.match(route, /accountingPicSnapshotProfileId: client\.accounting_pic_profile_id/);
  assert.deepEqual(scopedWorkspace("monthly_compliance", { July: [{ databaseId: "A", taxPicSnapshotProfileId: "staff-a" }] }, new Set(), "supervisor", true).July.length, 1);
  assert.match(route, /\.eq\("version", current\.version\)/);
});
