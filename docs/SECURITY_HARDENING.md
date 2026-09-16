# Security Hardening Deployment

Run these migrations in the Supabase SQL Editor, in this order:

1. `supabase/migrations/202609140001_notification_delivery_hardening.sql`
2. `supabase/migrations/202609140002_security_identity_and_operational_state.sql`

After all migrations through `202609160002_tax_case_progress_entries.sql`, run:

3. `supabase/migrations/202609160003_audit_security_and_recovery.sql`
4. `supabase/migrations/202609160004_audit_integrity_outbox_pagination.sql`

Migrations 3 and 4 are additive and must be applied before deploying the matching app
version. It blocks archived accounts at the database layer, adds idempotent My
Work creation IDs, and makes the three-day purge atomic. Take a Supabase backup
first. If the migration must be rolled back, keep the new columns and indexes;
remove only the new restrictive policies/triggers/functions after restoring the
previous application version.

The second migration is intentionally non-destructive. It adds permanent PIC
profile IDs and backfills them only where a display/full-name match is unique.
Review any client rows where `tax_pic_profile_id` or
`accounting_pic_profile_id` remains empty, then assign their PIC again through
the leadership client-management flow.

After deploying the app, test with one staff and one supervisor account:

- Staff can only read their assigned clients and cases and cannot see fees.
- Staff cannot call client import/export, allocate a client code, or change a
  profile role/team through the API.
- Supervisor can create/update clients, run import/export, and see all work.
- Two browser sessions editing an operational workspace receive a conflict
  rather than silently overwriting the newer version.
- An archived user's existing browser session receives `403` and cannot read or
  write through direct database policies.
- Purging an announcement removes both its recipient row and recovery marker,
  so it does not reappear after the recovery window.
- Repeating a timed-out My Work creation request with the same creation ID does
  not create a duplicate task.
- Duplicate cleanup moves Cases, Claims, and activity links to the canonical
  client atomically; restore the merge within three days during the smoke test.
- Completing and reopening an assigned task records the acting profile and a
  matching positive/reversal ledger event.
- Trigger `/api/maintenance/deliver-notifications` with `CRON_SECRET` and verify
  failed outbox rows retry without duplicating inbox recipients.
- Test My Work and client export above the configured Supabase row limit to
  confirm explicit pagination returns every accessible row.

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. It must never be prefixed with
`NEXT_PUBLIC_` or exposed in the browser.
