# Allocation: No PIC

Allocation offers an explicit No PIC option in both the Accounting and Tax PIC
dropdowns, on desktop and mobile. This is a manual choice; an Individual client
is not automatically unassigned. For an individual who needs only Tax services,
choose No PIC under Next ACC PIC and leave Next TAX PIC unchanged.

An empty draft string means remove the PIC, not keep the current PIC. Unspecified
draft fields still retain their existing assignment. Pending counts, Changed
only, sorting, the request payload, failure retries and printed reports follow
the same distinction. Current values and reports label empty assignments No PIC.
The PIC filters can also show clients with no Accounting or Tax PIC. The
`Filter by Next PIC` checkbox switches both dropdowns from saved to proposed
assignments without clearing either selection. Unchanged fields still filter
by their saved PIC, and an explicit blank draft matches No PIC.

Only leadership can apply an allocation batch; server authorization is unchanged.
The API requires both destination PIC fields explicitly to avoid clearing an
omitted field accidentally. Empty strings or explicit nulls become null profile
IDs and names. Nonempty names must still resolve to one active staff profile;
unknown or ambiguous names reject the entire batch before writing.

No migration or data rewrite is required. The existing
apply_client_pic_allocation_batch function accepts null assignments, updates
Client Master and inserts the yearly before/after history and activity record in
one transaction. Existing monthly snapshots, cases and annual work ownership are
not reassigned by this change. No PIC is a display label, not a fictitious staff
profile and is never stored as the PIC name.

## Compact PIC Distribution

Allocation keeps Visible Clients and replaces the Pending Changes, Last Batch
and Rule metric cards with compact Accounting PIC and Tax PIC count groups.
Each group includes every PIC from its active directory roster (including zero
counts), any legacy PIC still assigned to a visible client, and a separate No PIC
count. Names are grouped case-insensitively with trimmed/collapsed whitespace, so
case variants are not counted as different people. No PIC is not a staff record.

Counts use the same active, permission-scoped, fully filtered records as the
Allocation list, not only its rendered/windowed rows. Contract/Free of Charge/
On Demand follow the engagement filter; inactive clients never count. Search,
both PIC filters and Changed only also apply. Each client contributes exactly
once per division, including unassigned clients, so either division totals the
Visible Clients count. The saved count remains authoritative until Apply succeeds
and Client Master reloads.

### Draft Simulation

Choosing Next ACC/Tax PIC or bulk assignment calculates proposed counts for the
same currently visible client cohort. Changed PICs show Saved -> Proposed and a
signed delta; unchanged counts remain compact. A division with pending changes but
unchanged counts is labelled No net change (for example, an equal-size swap).
No PIC participates on both sides,
and an omitted draft field retains the current PIC while an explicit empty string
removes it. Case/whitespace variants still share one PIC entry. Both saved and
proposed division totals always equal Visible Clients, including unassigned rows.

The view is explicitly labelled Draft simulation while its visible clients have
pending changes. It respects the selected Current/Next PIC basis, engagement,
search and Changed only filters. In Next mode, a draft edit can move a client out
of the filtered view immediately without discarding the draft. Hidden clients and
hidden pending drafts are not part of this filtered preview. Clear the filters to
review overall impact before applying the batch. Chip order follows saved counts
so simulation alone does not reshuffle the people being compared.

Simulation never changes Client Master, history or API payloads and adds no write
requests. Reset or returning Next PIC to its current value removes the impact;
failed Apply retains both drafts and projections with saved values unchanged.
After a successful Apply/reload, saved counts reflect the confirmed assignments
and the preview disappears. The existing Apply still submits all eligible pending
drafts, including hidden ones; this preview does not narrow the save scope.

Pending edits remain visible as row statuses and a small count beside Apply for
the current filtered view. Apply/reset/report/selection/history/authorization
behavior is unchanged. The summary adds no API requests, database writes,
migration or dependency, and uses wrapping grids instead of another scroller.

## Shared Draft

**Shared draft** lets a Supervisor, Partner or legacy Admin publish their local
Next PIC proposals for the selected allocation year. Publish is explicit:
the proposals already in the browser remain private until published. Other
supervisors, partners and Leaders with Allocation access can see the same
read-only snapshot. The dialog refreshes every 30 seconds while visible, and
Refresh checks immediately. Publishing another snapshot replaces what viewers
see; Withdraw removes the visible forecast without deleting its audit history.

The shared draft is separate from the editable sheet. It never updates Current
PICs, applies the forecast, or replaces someone's personal draft. Missing PIC
fields retain the current assignment; explicit blanks forecast No PIC. A stale
publisher must refresh and review the newer version before replacing it.

Deploy `20261120084023_shared_allocation_drafts.sql` before enabling shared
drafts. It adds an append-only, server-only table with a primary key on year
and version. It does not write Client Master or migrate browser drafts.

## Entry Order

The Allocation order dropdown offers Company form / name (the existing default),
Oldest added first, and Newest added first. Column headers still sort other
fields; the dropdown shows Column sort for those explicit sorts. The choice uses
the existing account-scoped browser preferences and remains independent of PIC
filters and pending allocation drafts.

Date-added sorting uses Client Master's existing created_at timestamp, not
updated_at, the contract date or the allocation year. PIC changes and ordinary
client edits therefore do not change entry order. Clients created at the same
timestamp (including some bulk imports) use client code as a deterministic
numeric tie-breaker; the original Excel row order cannot be inferred from a
shared timestamp alone. Rows with missing/invalid creation dates appear after
known dates in both directions. No dates are synthesized, and no migration is
needed. The No. column continues to number the displayed, filtered rows.

## Bulk Selection And Reset

Row checkboxes select clients on desktop and mobile. Select all selects only
currently visible rows. Selections follow client IDs through sorting; rows
hidden by a filter or no longer active are removed from selection. The header
checkbox shows mixed state for partial selection. Selection itself is temporary
and is not stored in the database or browser preferences.

Selecting rows reveals Assign ACC PIC and Assign Tax PIC dropdowns. Choosing a
PIC (or No PIC) stages that field for the selected visible clients only; the
other field, including an existing unsaved choice, remains untouched. These
actions make no database requests. Clear selection leaves drafts intact.
Desktop also supports the Allocation sheet clipboard interactions below.

## Allocation Sheet

The desktop register uses a compact spreadsheet presentation. Client identity and
current PIC columns remain read-only; Next ACC PIC and Next Tax PIC sit together
as the only editable sheet columns. Mobile retains its compact cards and dropdowns.
Existing sorting, combined filters, row selection, bulk assignment, reset, year,
reports and audited Apply remain available.

- Click a Next PIC dropdown for an individual change. Shift+click another cell,
  or drag across cell edges, to select a rectangular range. Native dropdowns keep
  their normal one-click interaction; start a drag on the cell padding, not the
  dropdown arrow. Selection is temporary, not a database record or row-checkbox
  selection, and clears when the sheet is rebuilt for sorting/filtering/navigation.
- Ctrl+C (Cmd+C) copies selected Next PIC cells as Excel-compatible tab-separated
  values. Ctrl+V (Cmd+V) pastes one or two columns starting at the top-left selected
  cell, down the visible sorted rows. Two columns mean ACC followed by Tax.
  A single pasted name fills the entire selected range. Up to 250 rows per paste;
  pastes cannot extend beyond the visible rows or the two Next PIC columns.
- Blank cells and the explicit No PIC label remove that assignment. Missing
  columns leave the other PIC unchanged. Names match the appropriate active team
  roster case-insensitively with collapsed whitespace, using its canonical label.
  An existing legacy current name can be retained, not newly assigned elsewhere.
  Unknown/wrong-team/ambiguous names or malformed/overflow ranges reject the whole
  paste without partial draft changes. Server-side identity validation still runs
  on Apply and remains authoritative.
- Arrow keys navigate focused cells; Shift+arrows extend selection; Tab/Shift+Tab
  move between cells. Enter/F2 focuses the native dropdown. Escape clears the
  range. Native dropdown arrow-key behavior is retained while it has focus.
  This is not a full Excel shortcut/formula engine.

Paste and dropdown changes stage local drafts and immediately update the live
Saved -> Proposed distribution. They make no database requests. Normal edits and
bulk assignments patch affected editors/statuses and summary without replacing
the table, shell or popups, preserving focus and native scroll. When an explicit
sort/filter changes row order/membership, only Allocation is rebuilt, preserving
the table's scroll position. Preferences/history are saved once per action, not
once per pasted cell. Apply remains one leadership-only audited batch, with all
editing blocked while it is in flight. No schema migration or dependency is added.

Reset unsaved confirms before discarding every allocation draft, including
filtered-out clients, and clears selection. It also removes the discarded
allocation-save error. Saved Client Master assignments and allocation history,
the previous successful report, allocation year, sort and filters are retained.
Discarded drafts are removed from browser preferences so refresh cannot restore
them. This is not a database rollback.
Browser history entries from before reset or successful Apply cannot resurrect
discarded/applied drafts. Normal navigation between still-pending edits remains
supported.

Apply PIC Update still saves all pending drafts, not only selected rows, through
the existing leadership-only audited batch endpoint. During Apply, per-row and
bulk editing, selection, reset, duplicate submission and year changes are locked.
The submitted year is captured before the request and reused in its report.
Closing/reloading during an Apply request triggers the unsaved-work warning.
Success clears drafts and selection; failure unlocks editing and retains drafts
for retry or explicit reset. No schema migration or authorization change is
required.

## Legal PDF Preview

Preview PDF opens a real PDF in a separate browser tab. It uses US Legal portrait
(215.9 x 355.6 mm), with 10 mm top/left/right margins and 40 mm bottom margin on
every page. The PDF viewer provides Print and Download; opening the preview never
automatically opens the print dialog. Keep Legal paper and Actual size / 100% in
the printer dialog to retain the intended dimensions; printer hardware/settings
can override scaling or paper choice.

The report captures the currently visible, permission-scoped, filtered and sorted
Allocation rows at click time, with the allocation year, preparer, WITA timestamp,
filter/order labels, and Accounting/Tax Saved / Proposed counts. It is independent
of row-checkbox selection and the historical Print Latest Report action. Inactive
clients and clients outside the current scope are not included. Current and Next
PIC columns are printed together; changed Next cells are highlighted and pending
edits are labelled DRAFT / not applied. Empty assignments appear as No PIC.
Preview does not apply, reset, persist or write allocation/client/history data.
The snapshot does not change if editing continues while its PDF is prepared.

Column headers repeat, text wraps without truncation, oversized rows continue on
the next page, and page numbering remains above the reserved bottom margin.
Empty views cannot preview; preview is disabled during Apply and while another
preview is preparing. Blocked popups or resource failures show a retryable error
without affecting drafts. PDF blob URLs stay local to the browser and are released
when their tab closes or the originating page unloads; no public PDF or extra API
endpoint is created. Downloaded/printed copies contain client information and
should be handled accordingly.

PDF generation uses pinned jsPDF 4.2.1, vendored during postinstall, and the
SIL Open Font License Noto Sans Regular font from the official noto-fonts
repository. Their licenses ship alongside the assets. Only the small data-free
report renderer loads with the app; the engine and font load on first Preview
and are reused for subsequent previews. No CDN requests or database migration are
required. The exact public-asset allowlist includes only the renderer, PDF engine
and font, never client data or generated PDFs.
