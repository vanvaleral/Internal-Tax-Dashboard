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
actions. These retain the existing generation review and external work/subject
forms; newly saved external clients also enter the On Demand registry below.
**Full Screen** replaces Add Column and opens a standalone
new tab using the whole page, with Accounting/Tax team navigation. It retains the
year, status, PIC/search filters, active view and standard-column sort. Live mode
and the account binding are carried over; embedded mode and demo actor switching
are not. Navigation waits for active saves, and visible idle sheets refresh when
the user returns to the tab. No browser fullscreen permission is required.

Stable annual frames are outside the replaceable menu panels to preserve draft
cells. The central view-visibility step hides/shows them before rendering the
destination workspace, including mobile normalization and history-driven renders.
An inline hidden-container rule works even before the optional annual stylesheet
loads. Leaving Operations or returning to Monthly hides both teams without
destroying their frames; delayed readiness/appearance messages cannot reopen them.

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
middleware checks. The exact `/api/annual-sheet` and `/api/workspace/bootstrap`
handlers verify authentication
using `currentActor(request)` (Annual GET/POST and bootstrap GET): verified user,
current active-staff profile, account binding, then per-row permissions. Other
APIs retain middleware checks; the data-free root shell needs no database check.
See `WORKSPACE_STARTUP.md` for first-menu loading and timing. Neither client headers
nor a cached actor grant
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
Accounting lists active ACC assignments. Tax lists active Individual clients
assigned to the Tax PIC; it does not infer directors from corporate clients.
Previous-year Annual clients are an explicit separate generation source, not
silently mixed into the current Client Master list. API responses
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
and validates current PIC ownership and field baselines; edits are marked pending
until database confirmation. Automatic refresh throttling is not a guarantee
of a specific live load time; deployed latency must be measured separately.

## Idle Annual Preload

Once the dashboard's initial data is confirmed and its remaining startup requests
settle, it schedules a low-priority preload for the signed-in user's Accounting or
Tax team. It waits for document load and browser idle time (a 1.5-second deferred
fallback where idle callbacks are unavailable). Unknown teams are not guessed.
Mobile widths up to 900px, data-saving/2G connections, devices reporting at most
2 GB memory and hidden pages skip automatic preloading. Foreground annual
navigation cancels a scheduled preload; opening the other team discards unused
prefetched data instead of loading both teams in the background.

Only script/style prefetch hints and one account-bound `GET /api/annual-sheet`
request with `part=sheet` run. Hints do not execute scripts, and no hidden sheet
iframe, grid DOM or Client Master generation query is created. The existing API
still authenticates the user and filters authorized rows on every request. No
server/CDN, local-storage or cross-tab data cache is introduced.

The dashboard retains one authenticated snapshot in memory for at most 30 seconds
after receipt. Only its registered same-origin embedded sheet, with the exact
account and team binding, may consume it once. Opening during the request shares
that pending read. The normal transport owns subsequent reads, save baselines,
undo and permission-checked writes; it fences cancelled/older responses just as
for direct reads. An expired/missing/failed preload falls back to the sheet's
ordinary authenticated loading and retry path. Full-screen tabs perform their own
authenticated data read, though the browser may reuse prefetched static assets.

Account changes and successful logout clear cached data and remove old sheet
frames. Directory/access notifications, hidden/page-history transitions, resource
constraints and confirmed annual saves invalidate unused snapshots. Speculative
requests time out after eight seconds, and background failures are silent, with
no retry loop or global loading overlay. Once consumed/expired, no periodic annual
prefetch polling occurs. Server-side authorization and database schema are unchanged;
no migration is needed. Actual time saved depends on the browser/network and on
whether the user opens the sheet before the short-lived snapshot expires.

## Annual Generation Sources

**Add Client > Generate Clients** provides two sources for both teams:

- **Current PIC clients** reads today's active Client Master assignments. Accounting
  uses ACC PIC; Tax uses Tax PIC and Individual clients only.
- **Previous-year Annual clients** uses a selected earlier tax year's client list,
  including independent/external annual work. For linked Master clients, eligibility,
  name and both PIC assignments come from today's active Client Master, not the old
  Annual row. A reassigned client is eligible for its current primary PIC, even if
  that PIC cannot read the previous owner's old Annual row. Inactive/missing Master
  clients and unassigned primary PICs are excluded rather than treated as external.
- External work, which has no Master assignment, keeps the primary/secondary PICs
  recorded on the selected Annual source row, provided those PICs are still active
  in their corresponding team. A former secondary PIC becomes unassigned. Staff
  must be the primary PIC; assistant-only access is not enough to generate work.
  Leadership can filter and generate across eligible primary PICs.

The generation dialog has an independent primary-PIC filter and an earlier-year
selector. New source reads are fenced so a late response cannot replace the source
or year the user has just selected. Prior-year previews are read freshly on demand;
they are not loaded on startup or persisted locally.

At save time, the server rereads the source Annual row and current Master data. It
derives identity and PICs itself, rejects a stale ownership preview, and skips
existing target client/subject-year rows. It never accepts copied completion,
monthly flags, milestones, amounts, receipts, dates or notes. New work has a new
work ID and starts at Data Request with empty controls/evidence; older records are
unchanged. Prior-source row/year and the creating actor are recorded in its audit.

Accounting external work uses an Annual-only `annualClientId` to retain identity
across generated years. Legacy external rows fall back to their existing work ID
without rewriting history. Tax keeps its existing stable subject ID. A separate
`registeredClientId` links new external work to Client Master without changing its
Annual-only identity or treating its Annual PIC as a Master allocation.

Generation uses additive metadata in the existing Annual JSON records. External
registration requires the transaction migration documented below; no destructive
update, new dependency or automatic regeneration is needed.

## Bulk Entry And Individual Subjects

The footer **Add [number] more rows at the bottom** appends editable Draft rows
directly to the same table for either team, sharing its column headings and widths.
There is no separate insertion popup. Type in the cells, use their native PIC and
Progress dropdowns, or paste Excel values starting in a Draft cell. Paste follows
the currently visible columns and expands the drafts up to 250 rows per year.
Use values without a header row and ISO dates (YYYY-MM-DD). Payment value and Tax
payable display Indonesian grouping (`1.250.000`) in cells, editors and the formula
bar, including while typing. Use a comma for decimals (`1.250.000,50`). Amount paste
also accepts plain numbers, dot-decimal values such as `1250.50`, and unambiguous
international grouping such as `1,250,000.50`. Ambiguous values such as `1.234`
are treated as Indonesian grouping; use `1,234` to enter that decimal precisely.
Invalid/negative amounts are rejected, not silently stripped. Other numeric columns
retain their existing ungrouped input rules. Stored/API amounts and Excel workbook
cells stay numeric; blanks stay unknown and `0` stays nil. Amount clipboard copy
uses the localized representation to avoid reparsing decimal numbers as thousands.
Month counts fill January onward; Tax checklist counts fill
milestones left to right. Individually checked Tax milestones retain their exact
positions across views. Quoted tabs, quotes and multiline cells are parsed as
single cells. Enter / Shift+Enter move down/up; Tab / Shift+Tab move across fields,
appending a blank row at the end when needed, up to the same limit.

**Save new rows** validates and persists the named drafts; ordinary saved cells
retain their existing save mechanism. The formula bar is read-only for Draft cells
so its previous saved selection cannot accidentally be edited. Drafts remain in
memory for their user/year when switching views or years, until saved, explicitly
cleared or reloaded. Live pages warn before closing with meaningful unsaved drafts.
Access changes clear both draft memory and inputs. Blank templates do not trigger
this warning. Drafts do not appear in totals or Excel exports. Existing saved-cell
paste still edits only its selected visible range and cannot bypass locked cells.

Blank drafts are never persisted or counted. Named rows are validated as one
batch, then confirmed with one POST. Invalid data, duplicates, unauthorized PIC
assignments/deadlines or incomplete Tax filing evidence reject the whole batch.
Accounting names matching one eligible Client Master candidate link to that client;
other names create external Annual work and register it as On Demand. Individual
Tax names can link to their eligible Master candidate; other subjects are registered
independently of their linked company. Neither flow adds a Master PIC allocation.
The primary PIC is required
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
subjects. Existing historical workspace payloads and PIC ownership are preserved.

## External Client Registration

Apply `20261110074339_annual_external_on_demand_registration.sql` followed by
`20261110075519_annual_external_registration_team_type.sql` before deploying. The
second function-only migration handles the existing PostgreSQL team-division enum.
Only new external rows use the service-role-only, security-invoker
`commit_annual_external_clients` transaction. It compares/locks the workspace
version, registers the clients, records Master activity, and saves the linked Annual
payload atomically. A failed batch or version conflict cannot leave orphan clients;
missing migrations block external creation rather than falling back to partial saves.
Normal cell edits, archive/restore, and Master generation retain their existing save
path and do not run registration queries.

New Master records have a unique client code, Active lifecycle, On Demand engagement,
blank Master PICs, no inferred contract dates/fees, and false monthly obligations.
Annual amounts are tax payments, not client fees, and are not copied into Master.
Annual PICs and access stay on the Annual row. They never add to paid portfolio totals.
Previous-year external generation retains its registry link and Annual ownership,
even when its Annual display name changes; that label never silently renames Master.
Deleting an Annual row does not delete its registered client.

Case/whitespace/punctuation-normalized names are matched conservatively, respecting
known company forms and Individual Tax subjects. A single existing active match is
reused without changing its category, PICs, fees or dates. Multiple matches and
inactive/prospective matches block the batch for leadership review. No fuzzy name or
company-group matching is used. The short registration transaction serializes with
Master writes to prevent concurrent import/registration duplicate races.

Blank drafts and edits to pre-existing external rows do not register anything.
Historical external rows are not backfilled automatically; generating a new year
from them registers the new work. Retries use saved work UUIDs and cannot register
the same confirmed row twice. Rollback retains Master records, registry links and
audit history; reverting only application code must not delete registered clients.

Hosted rollout on 10 November 2026: initial migration ledger version
`20261110075425`, followed by enum-correction version `20261110075533`. Rolled-back PostgreSQL tests
verify actual client creation, reuse, per-year identity, audit entries, stale-write
rejection, ambiguous/inactive matches, all-or-nothing failure and RPC privileges.
The 222 existing clients, their activity records and operational workspace checksums
were unchanged by migration/testing. Code allocations in rollback tests can leave
normal sequence gaps; existing codes are never reused even if an imported dataset
has left the shared sequence behind. No private data export was needed.

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
- Ordinary cell edits stay interactive during saving for both teams. The working
  sheet shows pending values with an amber underline/dot and an explicit pending
  save status; these are not represented as database-confirmed values. Transport
  data remains a separate confirmed snapshot, never mutated by UI edits.
- Only one cell-save request runs at a time. Ordinary gestures made during that
  request share the next atomic batch (up to 250 distinct rows). Progress and NTPE
  changes are ordering barriers, preserving stage automation, previous-stage
  restoration and audit semantics. Dependent edits keep their original field
  baselines when applied to a response; unrelated concurrent data is not replaced.
- Responses do not rebuild an active text editor, drag or slider. Pending edits
  are replayed over confirmed data, not replaced by an earlier save response.
  Exports, Undo/Redo, row management, generation and full-screen navigation wait
  for pending saves. Leaving/reloading the page warns while writes are pending.
- Failed/unconfirmed saves stop dependent queued changes and restore the last
  confirmed data, reloading it when possible. An explicit error asks the user to
  review/re-enter stopped edits. There is no silent retry, offline persistence or
  local-storage save queue. Access loss clears private data and fences late reads
  and writes so they cannot resurrect a cleared session.
- Undo/redo uses inverse field edits with the same concurrency and permission
  checks. Creation and shared-column additions are not undo-deletable, preserving
  operational history. Standard cell edits remain undoable.
  A coalesced batch is one Undo step; unrelated remote edits returned by the server
  are excluded from that step.
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
8. Under a slow connection, edit multiple bars/cells without waiting. Verify amber
   pending marks disappear after confirmation and the latest values survive reload.
9. Type in a second cell while the first saves; its input/focus must stay intact.
10. Simulate a failed save and a same-field two-session conflict. Confirm queued
    dependent edits stop, the error is visible and no other user's data is replaced.

The non-blocking cell-save change needs no database migration or new dependency.
It removes the per-click interaction lock; it does not promise a sub-second
database round trip. Automated tests hold writes artificially to verify safe
interaction while slow saves are outstanding.

Local tests use mock database/client contexts. These checks do not substitute for
a real authenticated smoke test against the deployed project.
