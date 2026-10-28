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
- Search, ACC PIC and Tax PIC filters combine. Reset clears all three and returns
  sorting to Wajib Pajak ascending. Column headers toggle ascending/descending.
- Row numbers open progress below the row, including completed linked My Work
  tasks. Editing cells does not expand progress.
- The expanded panel combines stage/PIC/due-date context, existing notes,
  outstanding case next actions, open linked tasks visible to the user, completed
  linked work, and a dated follow-up log. Live follow-ups use the existing case
  progress API. Offline demo follow-ups are preview-only and make no API writes.
  Demo IDs are not treated as unsaved live cases. Genuine new live drafts explain
  automatic client-cell saving; progress becomes available after creation.
  Failed progress loads show Retry instead of an endless loading message.
  Progress refreshes replace only the expanded panel, preserving sheet editors.
  Expanded details use the visible table viewport width, not the full column
  span. A sticky inner panel stays visible during horizontal table scrolling;
  container queries stack its sections on narrow sheets, and long text wraps.
  The table itself retains native scrolling and adjustable column widths.
- Enter/Shift+Enter move vertically; Tab/Shift+Tab move between cells. Native PIC
  dropdown arrows remain native. Escape cancels an uncommitted cell edit.
- Saved client links are read-only. New rows must select a Client Master client;
  fields entered before selecting a client are explicitly marked as draft only.
- Multi-cell paste is rejected without modifying records. Single-cell paste is
  supported; this is not a full Excel replacement.

## Persistence And Authorization

No migration or data conversion is required. Existing `/api/cases` endpoints,
database UUIDs, linked tasks, soft archives and assignment history are retained.
Due dates continue to be calculated server-side. Only leader, supervisor and
partner roles can reassign Tax/ACC PICs; the API enforces this independently.

Spreadsheet changes save on leaving an input or choosing a dropdown value.
Writes are serialized per case using the last confirmed `updated_at` version.
Other rows may save independently. Pending values are visibly marked and are not
published to the operational record before server confirmation. Failed edits
revert to the confirmed value and show an inline error, without a silent local
business-data fallback. A version conflict requires refreshing before retrying;
it never overwrites another user's update.

Background refreshes preserve draft/pending records. Responses to reads started
before an intervening edit are ignored to avoid replacing newly saved values.
Untouched blank rows do not create database records. Unsaved drafts are not a
database backup and should be completed before leaving the page.

Regression coverage: `tests/case-control-sheet.test.ts` exercises rendering,
combined filters, sorting/reset, keyboard navigation, role restrictions,
confirmed saves, conflict rollback, background refresh and new-client linkage.
