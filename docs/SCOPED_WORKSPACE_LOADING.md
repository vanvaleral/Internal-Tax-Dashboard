# Scoped Workspace Loading

## Scope And Deployment

This application-only change addresses incomplete lists, broad startup reads and
eager historical downloads. No migration, cron, dependency, RLS alteration or
production data rewrite is required. Existing saves remain server-authorized,
version checked and audited. Roll back with the application deployment.

## Complete Lists

`readAllPages` follows returned row counts rather than assuming the project's
response cap equals our requested page size. Exact counts, duplicate IDs and
empty intermediate pages detect incomplete/changing reads; errors reject the
whole result instead of publishing a partial list. Pagination has a unique-ID
tie-breaker. This is not a transaction-wide snapshot across multiple requests.

Unpaged Client Master GETs now return the complete authorized list. Explicit
`limit`/`offset` callers still receive a page plus the total count. Bootstrap and
ordinary refreshes share this reader. A browser refresh rejects a list shorter
than its declared total and retains confirmed records. Cases, staff directories,
Annual generation catalogs, Monthly ownership lookup and My Work reads also use
explicit pagination. Fee redaction, assigned-PIC filtering and deleted-case scope
remain in the shared query paths.

## Startup Dependencies

Bootstrap includes a versioned `readPlan`. My Work and Notifications do not wait
for Client Master or the global staff directory. Annual starts with the selected
team's authorized sheet response, including that sheet's roster, rather than
also reading global catalogs. Monthly, Clients, Cases, Allocation, Profile and
Management retain the catalogs their current UI needs.

Omitted catalogs are optional queued work after readiness. If a user opens a
dependent menu first, that menu shows a local loading/retry state until confirmed
lists arrive; it never displays an empty list as a successful read. Data Saver
may skip speculative work but does not prevent explicit menu/history reads.
Concurrent Client Master reads coalesce within a write revision; responses from
before a write cannot replace newer confirmed data.
Menu navigation updates the startup hint immediately and defers other browser
preferences; refresh therefore plans the last selected menu, not an older one.

The plan grants no access. Every request still authenticates and scopes records.
Older bootstrap clients without `readPlan` keep their existing complete-load path;
older HTML receiving a new bootstrap safely fetches its missing dependencies.

## My Work History

`GET /api/my-work` retains the complete authorized response for older clients and
aggregate Client Overview reads. New My Work startup uses `?period=current`:
unfinished tasks and tasks completed during the current WITA month. Responses
carry the period and current month; historical cohorts in document memory remain
distinct from this complete current cohort.

Opening Archived requests `?period=archive-index`. The index includes month counts
and searchable titles, not task notes, steps or preferences. Selecting a month
requests `?period=YYYY-MM` for its full records. Creator/assignee/leadership
authorization applies independently to every query. Search still finds matching
months through the index, and CSV export waits for the complete selected month.
Failure produces local Retry and preserves Current tasks. A saved archive screen
also explicitly requests its history on Data Saver connections.

Pending edits and unsaved new tasks survive cohort refreshes. Reads started before
a task edit/acknowledgement are fenced off. Returning to Client Overview requests
complete history where needed for its existing totals instead of treating the
Current cohort as all work. No task or history records are stored persistently
by this change.

## Annual History

Sheet reads use `?year=auto` initially, or an explicit `year` from 2000 to 2100;
`year=0` retains the existing unassigned-year workflow. Auto prefers the previous
WITA year, falling back to the latest accessible stored year. Responses include
`sheetYear` and accessible `availableYears`, but only the selected year's full
rows. Changing year fetches that year; pending saves prevent switching midway.
Previous-year generation uses its dedicated authorized candidate endpoint, not
an eagerly downloaded copy of all prior worksheets.

Writes send the selected response year but still apply field edits against the
full stored workspace with compare-and-swap retries. Responses retain touched
cross-year rows for correct year moves and Undo. Other years, unknown legacy
fields, soft-deleted records and audit logs remain stored. Undo/Redo resets when
successfully loading a different year. Exports still include the full selected
year, all statuses required by the existing export, not just a filtered tab.

Important limitation: Annual data still resides in a team-wide JSON workspace.
These changes reduce response serialization, transfer and client rendering; the
server still reads that JSON to authorize/filter/save it. A future normalized or
year-partitioned database design requires a separate migration and history plan.

## Validation

Tests cover lists above 1,000 rows and smaller configured caps, explicit pages,
permission/fee boundaries, missing/duplicate pages, scoped bootstrap, deferred
menu loading, lazy archive contents/retry, and year-scoped Annual saves retaining
other years. Existing save queues, conflict handling, generation, deletion,
restoration and preloading remain regression requirements. Local tests do not
establish a deployed under-six-second startup result.

Phase 5 validation (2026-11-18): the selected 20-suite regression run passed
270/270 checks. Final affected reruns passed 68 checks, including WITA month
boundaries, later-page failure, menu-hint persistence and delayed Annual year
responses. One added test initially had a syntax typo; it was corrected and its
four-check reader suite rerun successfully. TypeScript, production build and
whitespace checks passed. Read-only production HTTP checks preserved auth nonces,
hash/resource policies, static root caching and protected API/HTML rejection.

A read-only fictional browser fixture verified refreshed My Work startup,
archive-index navigation and February 2020 task details, plus historical-year
rows in both embedded Annual teams. No browser-console warnings/errors were
observed after correcting the fixture's missing Annual fields. The browser
checks did not exercise production saves or measure deployed database latency.
