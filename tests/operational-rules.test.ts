import assert from "node:assert/strict";
import test from "node:test";
import { calculateHimbauanDueDate, notificationEventKey, uniqueProfileIds } from "../lib/operational-rules.ts";

test("notification recipient IDs are trimmed and deduplicated", () => {
  assert.deepEqual(uniqueProfileIds([" staff-a ", "staff-a", null, "", "staff-b"]), ["staff-a", "staff-b"]);
});

test("notification event keys are stable for safe retries", () => {
  assert.equal(notificationEventKey("tax_case", "case-42"), "tax_case:case-42:created");
  assert.equal(notificationEventKey("task", "task-42", "assigned"), "task:task-42:assigned");
});

test("Himbauan deadline is fourteen calendar days after the received date", () => {
  assert.equal(calculateHimbauanDueDate("2026-04-16"), "2026-04-30");
  assert.equal(calculateHimbauanDueDate("2026-02-20"), "2026-03-06");
  assert.equal(calculateHimbauanDueDate("not-a-date"), null);
});
