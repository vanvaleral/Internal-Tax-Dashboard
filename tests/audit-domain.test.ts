import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { mergeWorkspace, scopedWorkspace, redactFees } from "../lib/workspace-security.ts";
const require = createRequire(import.meta.url);
const { reconcile } = require("../public/workspace-sync.js");
const { parseAmount } = require("../public/claim-values.js");

test("F01 annual subset and empty saves retain other PICs and omitted records", () => {
  const rows = [{ clientName: "A", notes: "old" }, { clientName: "B", notes: "private" }];
  const saved = mergeWorkspace("annual_tax", rows, [{ clientName: "A", notes: "new" }], new Set(["A"]), "a", false);
  assert.deepEqual(saved, [{ clientName: "A", notes: "new" }, rows[1]]);
  assert.deepEqual(mergeWorkspace("annual_accounting", rows, [], new Set(["A"]), "a", false), rows);
});

test("F02 serialized scopes strip nested fees without modifying stored records", () => {
  const rows = [{ databaseId: "A", taxPicSnapshotProfileId: "a", serviceFee: 123, nested: { annual_fee: 50, note: "ok" } }, { databaseId: "B", taxPicSnapshotProfileId: "b" }];
  const result = scopedWorkspace("monthly_compliance", { July: rows }, new Set(), "a", false);
  assert.equal(result.July.length, 1);
  assert.equal(result.July[0].serviceFee, undefined);
  assert.deepEqual(result.July[0].nested, { note: "ok" });
  assert.equal(rows[0].serviceFee, 123);
  assert.deepEqual(redactFees({ source_snapshot: rows }), { source_snapshot: [{ databaseId: "A", taxPicSnapshotProfileId: "a", nested: { note: "ok" } }, rows[1]] });
});

test("F03 historical snapshot ownership survives client reassignment and cannot be forged", () => {
  const rows = [{ databaseId: "A", taxPicSnapshotProfileId: "old", taxPic: "Original", notes: "old", serviceFee: 25 }];
  const saved = mergeWorkspace("monthly_compliance", { July: rows }, { July: [{ ...rows[0], notes: "new", taxPicSnapshotProfileId: "attacker", serviceFee: 0 }] }, new Set(), "old", false);
  assert.equal(saved.July[0].notes, "new");
  assert.equal(saved.July[0].taxPicSnapshotProfileId, "old");
  assert.equal(saved.July[0].serviceFee, 25);
  assert.throws(() => mergeWorkspace("monthly_compliance", { July: rows }, { July: [{ ...rows[0], taxPicSnapshotProfileId: "attacker" }] }, new Set(), "attacker", false));
});

test("F03 three-way reconciliation merges unrelated edits and flags same-field conflicts", () => {
  const base = [{ databaseId: "A", notes: "", status: "Open" }];
  const local = [{ ...base[0], notes: "my edit" }];
  const remote = [{ ...base[0], status: "Done" }, { databaseId: "B", notes: "other" }];
  const result = reconcile(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.value[0].status, "Done");
  assert.equal(result.value[0].notes, "my edit");
  assert.equal(result.value.length, 2);
  assert.deepEqual(reconcile(base, local, [{ ...base[0], notes: "their edit" }]).conflicts, ["/A/notes"]);
});

test("F11 monetary parsing preserves cents, grouping, and rejects corrupt formats", () => {
  for (const input of [1234.56, "1.234,56", "1234.56", "Rp 1.234,56"]) assert.equal(parseAmount(input), 1234.56);
  assert.equal(parseAmount("1.234"), 1234);
  assert.equal(parseAmount("1.234.567,89"), 1234567.89);
  for (const input of [-500, "-500", "1,234", "1.2.3", "NaN", Infinity, 1.2345]) assert.throws(() => parseAmount(input));
});

test("F05 stored content sanitization removes executable markup and preserves safe dashboard controls", () => {
  const window = new JSDOM("").window;
  const DOMPurify = require("dompurify")(window);
  const sanitized = DOMPurify.sanitize('<section data-case-id="safe"><img src=x onerror="alert(1)"><script>alert(2)</script><textarea></textarea><svg viewBox="0 0 1 1"></svg></section>', { USE_PROFILES: { html: true, svg: true }, FORBID_TAGS: ["style", "iframe", "object", "embed"], ALLOW_DATA_ATTR: true });
  assert.match(sanitized, /data-case-id="safe"/);
  assert.match(sanitized, /<svg/);
  assert.doesNotMatch(sanitized, /onerror|script|alert/);
});
