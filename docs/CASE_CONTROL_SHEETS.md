# Case Control Sheets

Himbauan and Pemeriksaan now use a compact inline spreadsheet presentation in
`public/demo.html`. They remain tax cases, not annual or monthly workspace rows.
Both sheets retain their previous column names and category-specific fields.

The register uses one integrated panel for category tabs, archive/add actions,
search and PIC filters. Explicit column widths prioritize client names and notes;
subtle header tones separate reference, tracking and ownership fields. The client
and row-number columns stay pinned, and the sheet scrolls natively. Theme colors
come from the existing appearance settings rather than a separate fixed palette.

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
  The first read loads up to 25 entries from each history source; Load older
  updates follows timestamp/UUID keysets, retaining Postgres timestamp precision.
  It appends older records without duplicates instead of downloading all history
  whenever a row opens. The original unpaged API remains compatible.
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

Success responses for the case list, timeline, follow-up save, workflow save and
report include numeric `Server-Timing` auth/data durations. No client names, IDs,
follow-up text or credentials are placed in timing headers. Private response
bodies remain non-cacheable, and timing does not replace authorization.

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
