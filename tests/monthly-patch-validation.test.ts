import assert from "node:assert/strict";
import test from "node:test";
import { validateMonthlyPatch } from "../lib/monthly-patch-validation.ts";

test("accepts ordinary monthly edits", () => {
  assert.doesNotThrow(() => validateMonthlyPatch({ dataState: "received", followUpCount: 2, lastUpdated: "2026-09-28 11:00" }));
  assert.doesNotThrow(() => validateMonthlyPatch({ obligations: { ppn: { status: "done", payableAmount: 500000, receiptNumber: "NTPN-123", reported: true } } }));
});

test("rejects unknown fields, malformed values, and invalid obligation keys", () => {
  for (const changes of [
    {}, { taxPicProfileId: "other" }, { dataState: "finished" }, { followUpCount: -1 },
    { obligations: { ppn: { payableAmount: "500000" } } },
    { obligations: { ppn: { payableAmount: Number.POSITIVE_INFINITY } } },
    { obligations: { unknown: { status: "done" } } },
    { obligations: { ppn: { reported: "yes" } } },
    { obligations: { ppn: { status: "hacked" } } }
  ]) assert.throws(() => validateMonthlyPatch(changes));
});
