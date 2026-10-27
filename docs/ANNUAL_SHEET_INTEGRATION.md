# Annual Control Sheet Integration

## Runtime

Operations > Annual Compliance now opens the approved Accounting and Tax sheets
with `live=1`. File-based demos and the opt-in integration preview remain sample
only. Production starts with empty data behind a loading state, authenticates via
`/api/annual-sheet`, and never seeds or saves sample records. Preview actor controls
are hidden and cannot change the authenticated actor.

Accounting retains Summary only, click-to-edit segmented month bars, payment
value, NTPE auto-completion and a cyan Team Overview collapsed by default. Tax
retains separate subject-based milestone views and filing/payment evidence gates,
with the same collapsed-by-default Team Overview available across its views.
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

While `sheet-booting` is present, critical inline CSS clips document overflow on
html/body. The hidden, not-yet-styled workbook cannot briefly create a page scrollbar
before the asynchronous sheet styles arrive. Removing the boot class restores the
normal embedded/full-screen/standalone scrolling rules; native grid scrolling and
the small-viewport overflow fallback are unchanged.

An iframe parent covers the navigation gap, then hands over to the child's own
initial loader using a source/origin-checked mounted message. A status handshake
also handles listeners installed after that first message. Iframe `load` alone
does not release the parent cover or signal database readiness. Background reads
do not restore the initial loader.

Reviewed public UI assets (exact paths in `lib/public-ui-assets.ts`) skip Supabase
middleware calls on GET/HEAD, avoiding repeated session/profile round trips for
CSS, data-free JavaScript and the favicon. HTML pages, renderers with embedded
client/staff demo fixtures and downloads still pass through the existing
middleware checks. Only the exact `/api/annual-sheet` path delegates authentication
to its handler, which runs `currentActor(request)` for GET and POST: verified user,
current active-staff profile, account binding, then per-row permissions. Other
APIs retain middleware checks. Neither client headers nor a cached actor grant
access. Annual saves read the workspace, staff and columns concurrently, then
write through the same compare-and-swap check; retries reread current state.
There is no generic file-extension bypass and no cached authorization. This is
consistent with the [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)
to avoid running session middleware on routes that do not access Supabase.

Initial loading still waits for authenticated database data and never shows demo
records. Generation candidates warm in the browser's idle time (where supported)
or when Add Client is opened, without blocking startup. Requests are coalesced and
their preview results cached in memory for at most 60 seconds, never local storage.
**Refresh list** bypasses that cache; access changes discard it, including late
responses. Every creation rechecks current Client Master ownership on the server.
Accounting lists active ACC assignments. Tax combines active Individual clients
assigned to the Tax PIC with its existing prior-year SPT suggestions; it does not
infer directors from corporate clients. API responses
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

## Bulk Entry And Individual Subjects

**Add Client > Insert / Paste Rows** opens a draft grid for either team. Insert
blank rows or paste Excel values into a cell; paste expands the grid up to 250
rows. Column order is shown in the grid. Use values without a header row, ISO
dates (YYYY-MM-DD) and numbers without thousands separators. Month counts fill
January onward; Tax checklist counts fill milestones left to right. Quoted tabs,
quotes and multiline cells are parsed as single cells. Enter / Shift+Enter move
down/up a draft column; Tab moves across fields. Closing the draft grid retains
its rows in memory for that user/year until saved, cleared or reloaded. Access
changes clear both draft memory and inputs. Existing sheet paste still
edits only its selected visible range and cannot bypass locked cells.

Blank drafts are never persisted or counted. Named rows are validated as one
batch, then confirmed with one POST. Invalid data, duplicates, unauthorized PIC
assignments/deadlines or incomplete Tax filing evidence reject the whole batch.
Accounting names matching one eligible Client Master candidate link to that client;
other names create annual-only external work. Individual Tax names can link to
their eligible Master candidate; other subjects remain annual-only. Neither flow
writes Client Master or adds a PIC portfolio allocation. The primary PIC is required
for bulk work. Staff can create their own work, not assign it to another PIC.

Stable UUID request IDs support retry without duplicates. Initial values use the
existing field validation, completion rules and before/after audit events inside
the atomic workspace write. Explicit imported month counts are applied after
stage defaults so they are not silently replaced by automatic checks. Accounting
NTPE is applied after the imported stage, retaining that stage for reopening.
A late successful save discovered on retry is not
reapplied as an edit to confirmed data. Drafts are not cached across reloads.

An Individual Master candidate stores `sourceClientId` and a stable `subjectId`
inside its annual JSON row, plus a separate unique work ID for each year. Current
Master PIC assignments are snapshotted when generating a new year; earlier work
and historical PICs are not rewritten. Outside directors and people remain separate
subjects. No SQL migration is needed: these are additive keys in the existing
workspace payload, with operational history preserved.

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

Annual operational PIC choices follow Management > PIC Access: currently active
directory profiles in the corresponding team, excluding Partners as operational
assignees (Partners retain leadership permissions). The API includes role metadata
and validates these same rules on assignment writes. Inactive profiles remain
available server-side for resolving historical row IDs/names, not as new choices.

Directory loads and PIC Access edits rebuild the main operational lists and send
a change token to existing annual frames and same-origin full-screen tabs. No
staff names, claim codes or permission data are broadcast. The receiving sheet
invalidates its generation-preview cache and fetches authenticated data, bypassing
only the normal 30-second refresh throttle for that known change. Duplicate notices
are coalesced. Changes during edits/saves are queued without replacing the editor,
and a notice received during an older read triggers a fresh read afterward.
Browser-history restoration reconnects the cross-tab listener and refreshes it.
Confirmed staff create/update/restore/archive responses invalidate annual views
before reloading the full directory, so a failed follow-up list read cannot leave
annual sheets unaware of a successful change. Unconfirmed changes send no notice.
Directory read revisions also prevent an older background/access-list response
from undoing a newer confirmed directory change in the dashboard.

Team overview membership uses active Accounting or Tax profile IDs for the sheet,
including members with zero assigned work. Renamed members stay grouped by their profile ID. Work
assigned to inactive, Partner, unknown or other-team identities is retained under
**Former / Other PICs**, with a matching filter; it is not added back as a current
team member or silently excluded from totals. Historical row assignments and audit
records are not rewritten by these refreshes. No migration is needed.

Tax overview shows each primary Tax PIC's finished/total SPT subjects, remaining
subjects and completion percentage, sorted by lowest completion first. Clicking a
PIC toggles the Tax PIC filter (not the Accounting filter). Whole-year figures
stay independent of status/search/PIC filters and milestone view: Complete uses
the existing evidence-gated completion rule, while Documents, Preparation and
Filing & Payment count checked milestones out of their configured items per subject
(currently three each). Assistants do not double-count an owner's subject. The
same embedded panel is reused without an extra request or duplicate summary strip.
Staff see only authorized subjects with an explicit accessible-work scope label.

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
