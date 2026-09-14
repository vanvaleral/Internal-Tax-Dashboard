# Security Hardening Deployment

Run these migrations in the Supabase SQL Editor, in this order:

1. `supabase/migrations/202609140001_notification_delivery_hardening.sql`
2. `supabase/migrations/202609140002_security_identity_and_operational_state.sql`

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

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. It must never be prefixed with
`NEXT_PUBLIC_` or exposed in the browser.
