import assert from "node:assert/strict";
import test from "node:test";
import { canImportClientMaster, canManageDirectoryRole, isStaffDirectoryRole } from "../lib/staff-directory.ts";

test("only leadership can manage the staff directory and Partner controls Partner roles", () => {
  assert.equal(canManageDirectoryRole("staff", "staff", "staff"), false);
  assert.equal(canManageDirectoryRole("supervisor", "staff", "leader"), true);
  assert.equal(canManageDirectoryRole("leader", "staff", "partner"), false);
  assert.equal(canManageDirectoryRole("supervisor", "partner", "staff"), false);
  assert.equal(canManageDirectoryRole("partner", "partner", "staff"), true);
});

test("staff directory accepts only known roles", () => {
  assert.equal(isStaffDirectoryRole("leader"), true);
  assert.equal(isStaffDirectoryRole("partner"), true);
  assert.equal(isStaffDirectoryRole("owner"), false);
});

test("client master import is limited to Supervisor and Leader", () => {
  assert.equal(canImportClientMaster("supervisor"), true);
  assert.equal(canImportClientMaster("leader"), true);
  assert.equal(canImportClientMaster("partner"), false);
  assert.equal(canImportClientMaster("staff"), false);
});
