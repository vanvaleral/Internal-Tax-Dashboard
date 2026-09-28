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

## Legacy compliance view (2026-09-28)

`202609280001_secure_legacy_compliance_view.sql` makes `compliance_board` a
security-invoker view and revokes `anon` access. Production was updated on
2026-09-28; a read-only check confirmed `anon` has no SELECT privilege while
`authenticated` retains SELECT. The view now obeys the underlying RLS policies.
Do not recreate this view from `supabase/schema.sql` without preserving these
permissions and `security_invoker = true`.

## PIC Access retention (2026-09-26)

Apply `supabase/migrations/202609260001_staff_access_retention.sql` before deploying
the matching app version, and take a Supabase backup first. This additive migration
records when staff access is archived and when Auth-account deletion starts/ends.
It intentionally does not backfill old inactive profiles: they remain restorable
without an automatic deadline until reactivated and archived through PIC Access.

Newly archived staff appear in PIC Access > Recently Deleted and can be restored
for 14 days. The existing daily `/api/maintenance/purge-deleted` job then deletes
their Supabase Auth account and clears the profile's login/claim credentials. The
staff profile itself is retained for historical foreign keys and audit records.
The job processes up to 100 expired profiles per day and retries failed deletions
on the next run. Check its response/logs if it reports `failedStaffAccess`.
Because this is daily, physical deletion may happen after the exact 14-day mark;
the app blocks restoration once the 14 days have elapsed. Verify the existing
Vercel cron and `CRON_SECRET` remain configured. Never delete historical staff
profiles directly while business records reference them.
