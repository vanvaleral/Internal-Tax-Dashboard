# Annual Control Sheet Integration

## Runtime

Operations > Annual Compliance now opens the approved Accounting and Tax sheets
with `live=1`. File-based demos and the opt-in integration preview remain sample
only. Production starts with empty data behind a loading state, authenticates via
`/api/annual-sheet`, and never seeds or saves sample records. Preview actor controls
are hidden and cannot change the authenticated actor.

Accounting retains Summary only, click-to-edit segmented month bars, payment
value, NTPE auto-completion and a cyan Team Overview collapsed by default. Tax
retains separate subject-based milestone views and filing/payment evidence gates.
Both support PIC filtering, sorting, shared custom columns, year/status filters,
batch generation and selected-year Excel export. Staff exports include only rows
they are authorized to read; they are not firm-wide exports.

## Persistence And Permissions

- Existing `operational_workspace_state` arrays remain authoritative. IDs and
  unknown legacy fields are preserved. No annual rows are deleted or replaced by
  a migration. Historical tax flags, formatted amounts, dates and reported states
  are adapted for display, without inventing evidence or overwriting history.
- Rows with no year remain under **Year not set**. Leadership can assign a year;
  the API checks for a conflicting client/subject-year record. No year is inferred
  from today's date for existing records.
- Accounting edits require its ACC PIC or an explicitly recorded assistant ID;
  Tax edits require its Tax PIC or explicit assistant ID. Leadership can edit all
  rows. PIC changes, deadlines, tax year and subject identity require leadership.
  Client Master names cannot be changed from contract accounting rows.
- Account-bound requests use `x-workspace-user`; the existing middleware detects
  session changes. Parent messages cannot impersonate staff or authorize writes.
- Every save compares expected values for the fields it changes. Different-field
  or different-row concurrency is retained via bounded compare-and-swap retries.
  Same-field conflicts fail without silent overwrite. Paste/fill batches are one
  atomic workspace update. Fields derived by a stage or NTPE edit include baseline
  dependencies, so concurrent control/status edits cannot be lost.
- The UI updates only after database confirmation. Failed/unconfirmed saves reload
  shared data when possible; they do not enter a local-storage retry queue.
- Undo/redo uses inverse field edits with the same concurrency and permission
  checks. Creation and shared-column additions are not undo-deletable, preserving
  operational history. Standard cell edits remain undoable.
- Full before/after field events and actor IDs are appended to each saved row in
  the same atomic update. A summary audit entry is also scheduled after response.
  The old annual whole-payload PUT route is blocked to prevent bypassing these
  validations. Monthly Compliance's existing route remains unchanged.
- Clearing an NTPE restores its recorded previous stage. For legacy proofs with
  no recorded previous stage, the current stage is retained rather than guessed;
  the user may then reopen the work explicitly through Progress.
- Client generation is rechecked against active Client Master and actual PIC IDs
  at commit time, and skips existing client-year rows. New SPT subjects receive an
  independent ID; reviewed prior-year subjects retain that subject ID but reset
  their milestones in the new year. Outside work never creates an allocation.

## Additive Migration

Apply `supabase/migrations/20261026064050_annual_sheet_columns.sql` to enable shared
custom columns. It creates only a small metadata table with RLS and no public or
authenticated grants. All access is through the authenticated, role-checked API.
Creation records retain the actor and timestamp, and each row's values live in its
existing workspace JSON. No service key is sent to the browser.

The core sheets can read/edit existing annual work before this migration is
applied; **Add column** remains disabled with an explanatory title. The migration
does not initialize empty annual workspaces or rewrite any existing data.

Follow the existing backup and migration-ledger cautions in
`OPERATIONAL_HISTORY_MIGRATION_2026-09-27.md`. Do not use an unreviewed `db push` to
reapply all historical files. Apply only this reviewed additive migration to the
verified project after backup. It has been prepared locally, not executed against
production by this implementation.

Verification after applying:

```sql
select to_regclass('public.annual_sheet_columns');
select relrowsecurity from pg_class
where oid = 'public.annual_sheet_columns'::regclass;
select has_table_privilege('anon', 'public.annual_sheet_columns', 'SELECT') as anon_read,
       has_table_privilege('authenticated', 'public.annual_sheet_columns', 'INSERT') as staff_insert,
       has_table_privilege('service_role', 'public.annual_sheet_columns', 'INSERT') as server_insert;
```

Expected: table exists, RLS is true, public/staff access is false and server insert
is true. Then verify a leadership-created column persists across refresh, and that
a staff member cannot change another team's row or manage shared column metadata.

## Deployment Checks

1. Check existing rows, including a no-year legacy row, before generating work.
2. Generate a selected subset for one ACC PIC; repeat and confirm no duplicates.
3. Save a slider, payment value (including 0), and NTPE; reopen in another browser.
4. Clear NTPE and confirm the prior stage returns without fabricating month checks.
5. Check a Tax subject's filing/payment evidence and Complete status.
6. Test two sessions editing different fields, then the same field, on one row.
7. Export Excel and verify the selected year, authorized rows, payment, proof,
   custom fields and monthly/milestone details.

Local tests use mock database/client contexts. These checks do not substitute for
a real authenticated smoke test against the deployed project.
