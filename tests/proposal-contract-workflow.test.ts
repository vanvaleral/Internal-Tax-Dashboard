import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const demo = fs.readFileSync(path.join(root, "public", "demo.html"), "utf8");
const api = fs.readFileSync(path.join(root, "app", "api", "clients", "route.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "202609240001_proposal_contract_workflow.sql"), "utf8");

test("proposal and contract use distinct workflow stages on one client record", () => {
  assert.match(api, /"Active", "Inactive", "Proposal", "Contract"/);
  assert.match(demo, /const nextStatus = isContract \? "Active" : "Contract"/);
  assert.doesNotMatch(demo, /await saveClientToDatabase\(newClient\)/);
});

test("contract migration preserves the legal identity fields", () => {
  for (const field of [
    "responsible_person_name", "responsible_person_birth_place", "responsible_person_birth_date",
    "responsible_person_address", "notary_name", "notary_address", "deed_number", "deed_date",
    "contract_signed_at"
  ]) assert.match(migration, new RegExp(`add column if not exists ${field}`));
  assert.match(migration, /'Proposal', 'Contract'/);
});

test("proposal fees auto-calculate and contract activation validates required data", () => {
  assert.match(demo, /Number\(target\.value \|\| 0\) \* 12 \* 0\.3/);
  assert.match(demo, /Complete the contract before activation/);
  assert.match(demo, /at least one tax obligation/);
  assert.match(demo, /Confirm that the contract has been signed/);
});

test("contract fields are persisted through the clients API", () => {
  for (const field of [
    "responsiblePersonName", "responsiblePersonBirthPlace", "responsiblePersonBirthDate",
    "responsiblePersonAddress", "notaryName", "notaryAddress", "deedNumber", "deedDate",
    "contractSignedAt"
  ]) assert.match(api, new RegExp(field));
});
