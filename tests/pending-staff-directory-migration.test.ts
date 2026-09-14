import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/202609140005_pending_staff_directory.sql", import.meta.url),
  "utf8"
);

test("pending staff directory seeds the complete 15-person roster", () => {
  for (const name of ["Dewa Sumerta", "Ivan Sadhana", "Ita", "Cemari", "Okta", "Harry", "Denny", "Dewayu", "Tantri", "Dina", "Dimas", "Devira", "Budi", "Bagus", "Dinar"]) {
    assert.match(migration, new RegExp(`'${name}'`));
  }
});

test("pending profiles use private claim hashes and archive legacy directory entries", () => {
  assert.match(migration, /claim_code_hash text/);
  assert.match(migration, /directory_active boolean/);
  assert.match(migration, /update public\.staff_profiles set directory_active = false/);
  assert.match(migration, /set directory_active = true/);
});
