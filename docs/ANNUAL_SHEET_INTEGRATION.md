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

The toolbar uses **Add Client** with **Generate Clients** and **Add Ext Client**
actions. These retain the existing generation review and annual-only external
work/subject forms. **Full Screen** replaces Add Column and opens a standalone
new tab using the whole page, with Accounting/Tax team navigation. It retains the
year, status, PIC/search filters, active view and standard-column sort. Live mode
and the account binding are carried over; embedded mode and demo actor switching
are not. Navigation waits for active saves, and visible idle sheets refresh when
the user returns to the tab. No browser fullscreen permission is required.

## Loading And Refresh

The Next shell, dashboard HTML and annual sheets use the same small CSS-only cyan
bar animation. Critical loader styles and markup ship in the initial HTML; no
logo image or external animation stylesheet is needed. Annual sheet styles load
without blocking first paint. The sheet stays hidden until both its styles and
authenticated initial data are ready, with no minimum animation time or exit
delay. Style/data failures stay visible rather than exposing sample or unstyled
content. No migration is required for this loading change.

An iframe parent covers the navigation gap, then hands over to the child's own
initial loader using a source/origin-checked mounted message. A status handshake
also handles listeners installed after that first message. Iframe `load` alone
does not release the parent cover or signal database readiness. Background reads
do not restore the initial loader.

Reviewed public UI assets (exact paths in `lib/public-ui-assets.ts`) skip Supabase
middleware calls on GET/HEAD, avoiding repeated session/profile round trips for
CSS, data-free JavaScript and the favicon. HTML pages, renderers with embedded
client/staff demo fixtures, downloads and all data/API routes still pass through
the existing authentication, active-staff and account checks.
There is no generic file-extension bypass and no cached authorization. This is
consistent with the [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)
to avoid running session middleware on routes that do not access Supabase.

Initial loading still waits for authenticated database data and never shows demo
records. Client Master candidates are fetched only when Accounting's Generate
Clients dialog is opened; Tax does not query Client Master for its subject sheet.
Candidate reads are rechecked for the current active ACC assignments. API responses
include Server-Timing for authentication and data-query duration, to help separate
application/database time from browser/network/platform startup time.

Returning to a tab or team uses a background refresh, not the save-lock state.
Automatic reads are coalesced and limited to once per 30 seconds per sheet; the
Refresh button bypasses that interval. Confirmed cells remain usable, and unchanged
responses do not rebuild the grid. Changed responses wait while a cell, formula
field, slider, dropdown or dialog is being edited. Starting a save cancels and
invalidates older reads, including their transport cache, so a late response cannot
replace a newer confirmed save. Temporary refresh failures retain the last confirmed
data; detected authentication/account/access errors clear and lock the sheet.

No role or write authorization is cached server-side. Every save still authenticates
and validates current PIC ownership and field baselines, and only appears in the
sheet after database confirmation. Automatic refresh throttling is not a guarantee
of a specific live load time; deployed latency must be measured separately.

Clicking a spreadsheet row number opens **Delete Row**. Deletion requires a
confirmation and is available only to that team's primary PIC or leadership;
assistance permission alone does not allow deletion. This is a recoverable delete:
the row, its ID, values, and audit history remain in the workspace JSON, with the
deleting actor and timestamp. Client Master and the other annual team are never
modified. The **Deleted** tab is read-only and its row-number menu offers
**Restore Row**. Deleted rows are excluded from active totals, exports, management
workspaces and future-year suggestions. The selected client-year may be generated
again; restoring its older deleted row is blocked if an active duplicate exists.
Deleting/restoring clears cell undo history; use Deleted/Restore for recovery.
No additional migration or automatic permanent purge is required.

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
applied. The toolbar no longer exposes Add Column; existing definitions and values
are still loaded, editable by the appropriate PIC, and exported. The migration
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
