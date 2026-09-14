import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/202609140004_short_term_deletion_recovery.sql", import.meta.url),
  "utf8"
);

test("recoverable deletion keeps cases and personal announcement history separate", () => {
  assert.match(migration, /add column if not exists deleted_at timestamptz/);
  assert.match(migration, /announcement_recipient_trash/);
  assert.match(migration, /primary key \(announcement_id, staff_profile_id\)/);
});

test("deleted cases are hidden from ordinary direct reads", () => {
  assert.match(migration, /deleted_at is null/);
  assert.match(migration, /create policy tax_cases_read_scope/);
});
