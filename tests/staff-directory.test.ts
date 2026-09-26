import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("claim code regeneration is authorized, one-time, and never stores the plaintext", () => {
  const route = readFileSync(new URL("../app/api/staff/[id]/route.ts", import.meta.url), "utf8");
  const register = readFileSync(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8");
  const demo = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");
  assert.match(route, /if \(body\.action === "regenerate-claim-code"\)/);
  assert.match(route, /canManageDirectoryRole\(actor\.profile\.role, existing\.role as StaffRole, existing\.role as StaffRole\)/);
  assert.match(route, /existing\.auth_user_id \|\| !existing\.directory_active/);
  assert.match(route, /randomBytes\(16\)/);
  assert.match(route, /createHash\("sha256"\)\.update\(claimCode\)\.digest\("hex"\)/);
  assert.match(route, /\.update\(\{ claim_code_hash: claimCodeHash \}\)[\s\S]*?\.is\("auth_user_id", null\)\.eq\("directory_active", true\)/);
  assert.match(route, /notifyLeadership\(actor, "Regenerated claim code for"/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.match(register, /\.update\(\{ auth_user_id: created\.user\.id, username, claim_code_hash: null, claimed_at: new Date\(\)\.toISOString\(\) \}\)[\s\S]*?\.eq\("claim_code_hash", claimCodeHash\)/);
  assert.match(demo, /staff\.directory_active !== false && !staff\.auth_user_id && \(!\["partner", "admin"\]\.includes\(staff\.role\)/);
  assert.match(demo, /data-regenerate-staff-claim="\$\{staff\.id\}"/);
  assert.match(demo, /body: JSON\.stringify\(\{ action: "regenerate-claim-code" \}\)/);
});

test("registration requires only a private claim code, not a firm-wide referral code", () => {
  const register = readFileSync(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8");
  const form = readFileSync(new URL("../components/auth/login-form.tsx", import.meta.url), "utf8");
  const createStaff = readFileSync(new URL("../app/api/staff/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(register, /INVITE_REFERRAL_CODE|referralCode|Referral code/);
  assert.doesNotMatch(form, /referralCode|Referral code|referral code/);
  assert.match(register, /\.eq\("claim_code_hash", claimCodeHash\)/);
  assert.match(register, /\.eq\("directory_active", true\)[\s\S]*?\.is\("auth_user_id", null\)/);
  assert.match(createStaff, /randomBytes\(16\)/);
});
