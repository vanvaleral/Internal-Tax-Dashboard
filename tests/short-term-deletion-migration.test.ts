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

test("duplicate client deletion has an isolated three-day recovery snapshot", () => {
  const duplicateMigration = readFileSync(
    new URL("../supabase/migrations/202609140008_client_duplicate_hard_delete_recovery.sql", import.meta.url),
    "utf8"
  );
  assert.match(duplicateMigration, /create table if not exists public\.client_master_duplicate_trash/);
  assert.match(duplicateMigration, /client_record jsonb not null/);
  assert.match(duplicateMigration, /activity_records jsonb not null/);
  assert.match(duplicateMigration, /revoke all on table public\.client_master_duplicate_trash from authenticated/);
});

test("announcement recovery storage can only be written by the intended recipient", () => {
  const recipientPolicy = readFileSync(
    new URL("../supabase/migrations/202609140010_announcement_trash_recipient_policy.sql", import.meta.url),
    "utf8"
  );
  assert.match(recipientPolicy, /create policy announcement_recipient_trash_recipient_only/);
  assert.match(recipientPolicy, /from public\.announcement_recipients recipient/);
  assert.match(recipientPolicy, /with check/);
});
