import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/202609140003_client_lifecycle_and_tax_office.sql", import.meta.url),
  "utf8"
);

test("client lifecycle migration preserves contract, inactivation, and KPP data", () => {
  assert.match(migration, /contract_started_at date/);
  assert.match(migration, /inactivated_at date/);
  assert.match(migration, /tax_office_region text/);
  assert.match(migration, /where status = 'Inactive' and inactivated_at is null/);
});

test("client lifecycle trigger dates status changes and clears reactivations", () => {
  assert.match(migration, /new\.inactivated_at = current_date/);
  assert.match(migration, /new\.inactivated_at = null/);
  assert.match(migration, /create trigger client_master_track_lifecycle/);
});

test("lifecycle correction preserves an inactive client's recorded engagement end", () => {
  const correction = readFileSync(
    new URL("../supabase/migrations/202609140009_client_lifecycle_history_correction.sql", import.meta.url),
    "utf8"
  );
  assert.match(correction, /set inactivated_at = engagement_end/);
  assert.match(correction, /inactivated_at is null or inactivated_at > engagement_end/);
  assert.match(correction, /coalesce\(new\.inactivated_at, new\.engagement_end, old\.inactivated_at, current_date\)/);
});
