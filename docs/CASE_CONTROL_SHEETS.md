# Case Control Sheets

Himbauan and Pemeriksaan now use a compact inline spreadsheet presentation in
`public/demo.html`. They remain tax cases, not annual or monthly workspace rows.
Both sheets retain their previous column names and category-specific fields.

SKP & STP and Penalty Removal are now sibling controls derived from Pemeriksaan
workflow products, not duplicate cases or compliance rows. Their compact parent
registers retain native horizontal scrolling and saved column widths; expanded
documents wrap into labeled cards on narrow viewports. Existing case-sheet
range paste remains specific to Himbauan/Pemeriksaan fields. Assessment cells
save individually through the version-checked financial workflow, rather than
allowing bulk paste to bypass receipt/PSA safeguards. See
`docs/CASE_WORKFLOW_INTEGRATION.md` for SPHP closure and PSA rules.

The register uses one integrated panel for category tabs, archive/add actions,
search and PIC filters. Explicit column widths prioritize client names and notes;
subtle header tones separate reference, tracking and ownership fields. The client
and row-number columns stay pinned, and the sheet scrolls natively. Theme colors
come from the existing appearance settings rather than a separate fixed palette.

## Viewport Layout

Desktop Cases uses the available workspace height instead of subtracting a fixed
270px estimate from the viewport. The top bar, feature notice, category navigation,
summary, filters and save footer keep their natural height; the table flexes into
the remainder and owns native vertical/horizontal scrolling. Expanded timelines
stay inside that table, rather than extending the main page. All four categories
and the desktop Full Screen sheet share this behavior.

When Archived Cases is open, its restore list has a bounded native scroll region
alongside the remaining active-sheet space; it cannot push the whole frame down.
The layout class is removed when navigating out of Cases, without changing Clients
or other workspaces. No wheel handlers, scroll corrections, data mutations or
database migration are involved. Mobile keeps its existing responsive layout;
very short desktop windows (480px or less, including extreme zoom) use natural
page scrolling so every control remains reachable.

## Interaction

- Full Screen opens the active case category in a separate, account-bound tab
  using the same protected dashboard renderer and Cases APIs. The standalone
  layout hides the sidebar/topbar, fills the viewport, retains both category
  tabs, and provides a Dashboard link. Existing browser preferences supply
  filters, sorting, appearance and column widths. Category query parameters
  survive refresh and Back/Forward; standalone use does not replace the main
  dashboard's saved menu. Pending saves and new live drafts block opening a new
  copy. No monthly/annual/performance/announcement data is preloaded there.
  Column-width changes sync between same-account dashboard/standalone tabs
  without repainting editors; preferences from other account keys are ignored.
- Drag the right edge of a column header to resize it. Widths are saved as
  account-scoped browser preferences, separately for Himbauan and Pemeriksaan,
  and restored after refresh. They are not synced between browsers/devices.
  Double-click a header border to reset that column. A focused border supports
  Left/Right (8px), Shift+Left/Right (24px), and Home (reset). Escape or pointer
  cancellation abandons an unfinished drag. Filter Reset does not erase widths.
- Search, ACC PIC and Tax PIC filters combine. Default/Reset order is oldest
  created case first, not Wajib Pajak alphabetical order. No. sorts by creation
  order; other column headers toggle ascending/descending. Numbers are creation
  ranks in the accessible category, calculated before filters/sorting, so name
  sorting and filters do not renumber records. They are not permanent database
  IDs and can close gaps after archival. Existing created_at values are retained
  on saves; new rows are appended. Legacy automatic name-sort preferences reset
  once; subsequent explicit sorts remain saved.
- Row numbers open progress below the row, including completed linked My Work
  tasks. Editing cells does not expand progress.
- Authorized manual follow-ups have a small red X at the top-right of their
  timeline card. It retains an accessible label/tooltip and the existing reason
  dialog, recoverable removal and audit history. Automatic task/workflow events
  are not removable here, and retained removed entries keep their Restore action.
- A compact summary counts the current category/filter scope by progress,
  payment/instalments, revision and completion. Print Report opens an A4 report
  of those saved records and the browser print dialog. See `docs/CASE_REPORTS.md`.
- Live Cases use concise action labels and a single timeline heading, without
  mockup instructions or repeated workflow explanations. Offline sample warnings,
  unsaved-draft notices, access/save errors and payment/closure safeguards remain.
  The legacy default Waiting Client Docs displays as In Progress, not an inferred
  missing-document blocker. Saved stages and explicit non-default stages are
  unchanged; the duplicate stage label below the workflow tabs is omitted.
- The expanded panel combines stage/PIC/due-date context, existing notes,
  outstanding case next actions, open linked tasks visible to the user, completed
  linked work, and a dated follow-up log. Live follow-ups use the existing case
  progress API. Offline demo follow-ups are preview-only and make no API writes.
  Demo IDs are not treated as unsaved live cases. Genuine new live drafts explain
  automatic client-cell saving; progress becomes available after creation.
  Failed progress loads show Retry instead of an endless loading message.
  Progress refreshes replace only the expanded panel, preserving sheet editors.
  Opening/closing a row inserts/removes only its detail row; the table, column
  widths, focused sheet editors and native horizontal scroll are not rebuilt.
  Saved-case follow-ups can be entered while history loads. Recent history is
  reused for 60 seconds in document memory, with one in-flight read per case.
  Stale history remains visible while refreshing; explicit Retry bypasses the
  cache. Changed case versions invalidate freshness, and removed/inaccessible
  cases discard cached history. My Work completion still invalidates the cache.
  The first read loads up to 10 entries from each history source; Load older
  updates follows timestamp/UUID keysets, retaining Postgres timestamp precision.
  It appends older records without duplicates instead of downloading all history
  whenever a row opens. The original unpaged API remains compatible.
  The combined timeline initially renders the ten newest loaded events (including
  workflow events), not every loaded record. Load older updates increases the
  visible window by ten. When a source has more history, its next page is fetched
  before expanding that window so a busy source cannot be skipped behind older
  cached events. Fully cached history can be revealed without another request.
  Fine-pointer hover or keyboard focus on a saved case schedules a preload after
  300 ms. Leaving cancels the timer. Only one speculative read runs at a time;
  opening that case shares the request and recently prefetched history uses the
  same 60-second cache. No bulk preloading of the register is performed. Offline,
  hidden, Data Saver and 2G contexts skip speculation, as do unsaved draft rows.
  Pending follow-up, cell and workflow saves also suppress speculative reads.
  A failed unused preload does not raise a global save/connection warning.
  Follow-up saves disable only that case's submit button, not other cells. A
  confirmed database response is required before adding to history or displaying
  Saved. Failure retains the draft across collapse/navigation for correction or
  retry. Pending saves warn before page closure and block report printing.
  Expanded details use the visible table viewport width, not the full column
  span. A sticky inner panel stays visible during horizontal table scrolling;
  container queries stack its sections on narrow sheets, and long text wraps.
  The table itself retains native scrolling and adjustable column widths.
- Enter/Shift+Enter move vertically; Tab/Shift+Tab move between cells. Native PIC
  dropdown arrows remain native. Escape cancels an uncommitted cell edit.
- Drag across cells, Shift+click, or Shift+Arrow to select a rectangular range.
  Ctrl+C copies it as Excel-compatible tab-separated text, with day-first dates
  and escaped multiline/quoted cells. Native copying of selected text within a
  single editor still works. Escape from a range returns to its cell editor.
- Saved client links are read-only. New rows must select a Client Master client;
  fields entered before selecting a client are explicitly marked as draft only.
- Ctrl+V pastes rectangular ranges of up to 250 rows, starting at the selection's
  top-left. One value fills the selected rectangle. Paste validates all dates,
  bounds, client links and PIC permissions before editing anything. Unchanged
  read-only values may round-trip; changed saved client links and derived fields
  are rejected. Leadership can paste unambiguous active directory PIC names/IDs;
  ordinary staff cannot reassign ownership. A case must retain at least one PIC.
  Additional new rows can be appended when pasting from Wajib Pajak on an
  unfiltered sheet, provided each has a valid Client Master client. No new master
  clients are created by a case paste.
- Visible date cells and Jatuh Tempo always display `dd/mm/yyyy`, independent of
  browser locale. Text editors accept typed/pasted `dd/mm/yyyy` dates (also
  `d/m/yyyy` and ISO `yyyy-mm-dd`), including a trailing Excel line break. Valid
  dates are normalized for display, converted to ISO for storage and save when
  leaving the cell. Invalid pastes leave the editor unchanged; invalid typed
  dates revert to the previous saved date on blur with an inline error. Empty
  text clears an editable date. Calendar buttons retain native date selection,
  with selections immediately saved and displayed in day-first format;
  Alt+Down opens the focused date cell's calendar. Escape,
  pending saves, refreshes and conflict rollbacks retain the same day-first
  display; due-date calculations and chronological sorting are unchanged.

## Persistence And Authorization

### Fast Follow-Up Saves

Timeline follow-ups now call `save_case_progress_fast` to perform the final active
profile/PIC/archive checks and immutable insert in one database request, rather
than a case lookup followed by a separate insert. Fresh API session/account and
feature checks remain mandatory. The function is SECURITY INVOKER, service-role
only, with an empty search path and short lock timeout. Shared row locks prevent
case reassignment/archival and staff deactivation racing the save.

Apply `20261107031759_fast_case_progress_save.sql` before deploying the API.
This matches the hosted migration version applied on 7 November 2026.
It adds one function and execution grants only; existing records, tables and RLS
policies are unchanged. The old checked save path remains available solely when
the function is absent during a rolling deployment, never after denial or an
uncertain/failed write. Removing the new function restores that fallback; no
history needs reverting. Do not delete saved progress entries to roll back code.

Each new follow-up gets a UUID before dispatch, retained in document memory for
retries of unchanged text until acknowledgement. Replaying that ID returns the
same saved entry; reusing it for different case/author/text is rejected. No
history is updated or overwritten. Older clients without an ID remain compatible.
Reloading loses unconfirmed request IDs, so refresh history before retrying after
a page reload or ambiguous network failure.

Starting a save updates the existing button/status without replacing the expanded
editor. Users can keep typing or work in other rows. Saved history, stale-row
colors and report availability update only after database confirmation. Failures
retain the draft; nothing pending is represented as confirmed work.

Supabase validation used a service-role transaction rolled back in full: repeated
IDs returned one entry, changed text/invalid actors/unassigned staff/archived cases
were rejected, and all five original follow-ups remained unchanged. Anonymous and
authenticated roles have no function execution privilege. This removes a data
round trip, not a guarantee of sub-second platform/network latency.

The post-migration security advisor reported no finding naming this function.
Unrelated existing notices remain for [mutable function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
[authenticated SECURITY DEFINER helpers](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Those settings/functions were not changed as part of this performance update.

The original sheet editor requires no data conversion. The additive BA/payment/
Tax execution and retained task timeline extension requires the migration in
`docs/CASE_WORKFLOW_INTEGRATION.md`; all sheet capabilities above are preserved.
Existing `/api/cases` endpoints,
database UUIDs, linked tasks, soft archives and assignment history are retained.
The exact Cases, workflow and report handlers perform fresh session, active-staff,
account-binding and feature-access checks themselves, avoiding duplicate middleware
checks. Their existing record/PIC authorization remains mandatory. Other routes
retain middleware protection. No schema migration is needed for these performance
changes. Timeline reads/follow-up writes include Server-Timing headers for auth
and data time; production latency still depends on network and database response.
Due dates continue to be calculated server-side. Only leader, supervisor and
partner roles can reassign Tax/ACC PICs; the API enforces this independently.

Spreadsheet changes save on leaving an input or choosing a dropdown value.
Writes are serialized per case using the last confirmed `updated_at` version.
Other rows may save independently. Pending values are visibly marked and are not
published to the operational record before server confirmation. Failed edits
revert to the confirmed value and show an inline error, without a silent local
business-data fallback. A version conflict requires refreshing before retrying;
it never overwrites another user's update.

Bulk paste uses the same save queues, combining ordinary fields into one request
per row and using the existing leadership-only PIC endpoint for assignments.
Only two rows save concurrently; new-case creation is serialized to retain input
order. The grid is temporarily non-editable and background case reads pause during
a batch, preventing intervening edits from being overwritten by queued paste.
Closing/reloading the page during a batch triggers the browser's unsaved-work
warning.
Writes are not one cross-row transaction: a conflict can leave other rows saved;
the summary identifies incomplete rows, keeps successful writes and reverts only
failed edits. New drafts with failed creation remain drafts, not saved records.

Background refreshes preserve draft/pending records. Responses to reads started
before an intervening edit are ignored to avoid replacing newly saved values.
Overlapping case-list refreshes share one in-flight request unless a write has
intervened. A newer read supersedes older responses. Unchanged normalized records
retain their object identities, and unchanged lists do not rebuild the sheet.
Actual changes still refresh the view; if typing temporarily defers that refresh,
it remains queued for a later read rather than being lost when data is unchanged.
Malformed list responses retain the existing confirmed rows and can be retried.
When the case table is rebuilt, its current horizontal scroll position is restored
after column widths are applied. This also covers directory refreshes and direct
case renders after interactions, in both categories and Full Screen. A delayed
read preserves where the user is when the response is applied, not where they
were when the request began. Native browser clamping handles narrower layouts;
there is no wheel interception, scrolling animation, timer correction loop or new
persisted scroll preference. Existing vertical-scroll handling is unchanged.
Untouched blank rows do not create database records. Unsaved drafts are not a
database backup and should be completed before leaving the page.

## Sidebar Points

The monthly-points sidebar widget is removed. Performance ledger reads continue
in the existing background queue and two-minute visible-page refresh. Point
awarding/calculation, Profile and Management/Recognition are unchanged; hiding
the sidebar count does not disable or reset points.

## Checking Cases Speed

### Assigned Warmup And Stale Rows

After Cases opens, a 1.5-second low-priority timer may warm up to three distinct
unfinished cases assigned to the signed-in profile: the one they last personally
worked, the newest created assigned case, and the oldest assigned case inactive
for 30+ days. This is a per-document cap, not a loop through the whole portfolio.
Reads run sequentially using the existing speculative-read gate, skip active
editing/saves and constrained/hidden/offline contexts, and share hover/click reads.
Supervisor visibility alone does not add other PICs' cases to this shortlist.

Unfinished saved rows are light yellow at 30+ WITA calendar days since activity
and light red at 60+. Completed, archived, draft and unknown-age rows are not
highlighted. The row-number tooltip states age; selection/focus stays distinct.
Colors refresh on rendering, confirmed updates, visibility changes and a visible
one-minute UI timer, without wheel interception or database polling.

Activity includes the case record, follow-ups, workflow events, retained linked
My Work events and legacy task completions. Case-list/bootstrap reads embed only
the newest timestamp per source (plus the current PIC's newest contributions),
not timeline bodies. Parent ownership scope is unchanged. Missing old-schema
relationships fall back to scoped case rows with unknown activity, not guessed
stale warnings. Permission/query failures do not fall back. No migration is needed.
The personalized timestamps are ranking hints, never permissions or task awards.

Success responses for the case list, timeline, follow-up save, workflow save and
report include numeric `Server-Timing` auth/data durations. No client names, IDs,
follow-up text or credentials are placed in timing headers. Private response
bodies remain non-cacheable, and timing does not replace authorization.

In the dashboard iframe console, `casePerformanceSnapshot()` returns up to 30
recent history/prefetch/follow-up request samples: operation, request duration,
HTTP status (0 if no response), and numeric auth/data server timings if present.
It returns copies, stays in document memory, and stores no URLs, case IDs,
client names, follow-up text or credentials. Request duration stops at response
headers; it is not a full click-to-render measurement. Compare browser Network
and rendering traces as well before deciding to change hosting or database code.
The current history queries already run concurrently; this change does not remove
fresh identity, feature or record/PIC checks to make a benchmark look faster.

After deployment, use browser DevTools Network while opening a case, reopening
it within a minute, saving a follow-up, and switching away/back. Compare request
Duration with the response's `Server-Timing`: auth is identity/profile/access
verification, data is subsequent server work, and the remaining elapsed time can
include network/platform overhead. Do not add overlapping history-query times.
Use repeated samples, not one request, and do not export cookies or full HAR files.
Local regression tests verify reduced requests/repaints, not a guaranteed live
under-one-second database response. No hosting-plan or region change is made.

Regression coverage: `tests/case-control-sheet.test.ts` exercises rendering,
combined filters, sorting/reset, keyboard navigation, role restrictions,
confirmed saves, conflict rollback, background refresh and new-client linkage.
