# Case Summary And Printing

The Cases register has a compact summary above the search/filter toolbar and a
Print Report action, with separate desktop/mobile spacing around the summary.
The sheet, resizable columns, saved widths, native scrolling,
range copy/paste, sorting, original PIC permissions and Full Screen remain intact.
No migration, new dependency, external service or automatic delivery is required.

## Counting

The summary uses the current category and the same search, ACC PIC, Tax PIC and
workflow filters as the sheet. Only saved cases visible in the user's existing
scope are counted. Drafts and archived cases are excluded and case IDs deduplicated.

| Field | Meaning |
| --- | --- |
| Handled | Total saved cases in the current filtered scope |
| In progress | Before BA / SKP, or awaiting final AR / examination closure |
| Payment / Instalments | BA / SKP recorded with a verified unpaid balance, whether one payment or multiple instalments |
| Revision | Fully paid, but required SPT revisions remain unsubmitted |
| Done | Final workflow document recorded, or an explicitly completed legacy case |

Each case belongs to exactly one of the last four groups, which sum to Handled.
Legacy completion uses the original Closed stage, closed date or completion date
when no managed workflow result exists. A managed case awaiting SP3P2DK is not
counted Done. Confirmed nil cases still wait for final closure. Unverified
receipts do not advance a case out of Payment / Instalments.

## Report

Print Report reserves a new window, loads the latest saved progress for every
included case, then invokes the browser print dialog. The user chooses a printer or Save as PDF;
browser security does not permit silent physical printing. The document includes
the summary, filter labels, WITA generation time and cases grouped by status,
with their register numbers, client, letter, both PICs, status, due/internal target
and verified unpaid balance. The rightmost column shows the latest progress,
its PIC and timestamp, and the last case-update PIC/date/time in WITA. If a later
record edit occurred after that progress entry, both times appear separately.
Unknown payable amounts stay unknown, not zero; unknown update authors are not
guessed from the current Tax/ACC assignment.

Confirmed My Work subtask completions/reopens are also eligible latest progress,
including their parent task title and actual PIC/date. Historical checked-step
snapshots without a known completion date remain visible in the case timeline,
but never become fresh report activity or suppress a separate parent completion.

Printing waits for pending case writes. Counts and report values update only
after database confirmation, without replacing sheet editors or widths. A blocked
popup produces a clear retry message. The report uses the authorized filtered
register rows and read-only POST `/api/cases/report` batches of at most 100 IDs.
The server authorizes every case before reading follow-ups, retained My Work
events, legacy completions and workflow actions, then returns only the newest
entry and last-update metadata per case. It reads history pages rather than
silently truncating at 1000 rows. Unopened rows are included; an older cached
expanded panel is not used as a live report source.

Version mismatches or progress-read failures stop printing rather than produce
an outdated or partial report. Local edits started while preparing a report also
require retry after saving. This does not lock the rest of the sheet. No business
data is stored in browser storage, and all record/filter text is escaped. Offline samples are explicitly
labeled as such. This is a current operational report, not a finalized monthly
partner-report snapshot or a historical month-end reconstruction.

## Copy Cleanup

Repeated workflow explanations and duplicate timeline headings were removed from
live Cases. The implicit Waiting Client Docs default is displayed as In Progress,
without rewriting its saved stage. Explicit stages, confirmation failures,
permission restrictions, offline/draft warnings and closure prerequisites remain.

Regression coverage: `tests/case-report.test.ts`, `tests/case-report-progress.test.ts`,
`tests/case-control-sheet.test.ts`.
