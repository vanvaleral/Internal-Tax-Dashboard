import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/202609140006_client_import_schema_compatibility.sql", import.meta.url),
  "utf8"
);

test("client import compatibility migration adds fields required by the export/import payload", () => {
  for (const field of ["company_form", "notes", "partner_name", "supervisor_name", "service_package", "proposal_status", "contract_started_at", "inactivated_at", "tax_office_region"]) {
    assert.match(migration, new RegExp(`add column if not exists ${field}`));
  }
});

test("client import compatibility migration safely adds Bagus to the staff directory", () => {
  assert.match(migration, /'Bagus', 'Bagus', 'Junior Tax Associate', 'Tax Team'/);
  assert.match(migration, /directory_active = true/);
});
