import assert from "node:assert/strict";
import test from "node:test";
import { findDuplicateClientGroups } from "../lib/client-import.ts";

test("duplicate detection matches NPWP first and normalized legal name when NPWP is absent", () => {
  const groups = findDuplicateClientGroups([
    { id: "a", clientCode: "CL-001", name: "PT Alpha Indonesia", npwp: "12.345.678.9-012.345", createdAt: "2025-01-01" },
    { id: "b", clientCode: "CL-099", name: "Alpha Indonesia", npwp: "123456789012345", createdAt: "2026-01-01" },
    { id: "c", clientCode: "CL-002", name: "CV Beta Jaya", npwp: null },
    { id: "d", clientCode: "CL-100", name: "Beta Jaya", npwp: null }
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].reason, "NPWP");
  assert.equal(groups[0].clients[0].id, "a");
  assert.equal(groups[0].clients.at(-1)?.id, "b");
  assert.equal(groups[1].reason, "name");
});
