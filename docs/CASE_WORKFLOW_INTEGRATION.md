# Cases Workflow Integration

## Scope And Preserved Features

The production Cases sheet is extended, not replaced by the separate mockup.
`public/demo.html` remains the renderer for the dashboard and Cases Full Screen.
Both original column sets, column-resize handles, account-scoped saved widths,
sort/creation numbering, combined search/ACC/Tax filters, Reset, native scrolling,
range selection, bulk date/text/PIC paste, keyboard navigation, soft archive,
restore, leadership-only PIC reassignment and existing follow-ups are retained.
No existing column is removed or repurposed. Workflow status/filters supplement
the grid, while its three workflow tabs live inside the existing expanded row.

`case-workflow-dashboard.js` and its CSS provide presentation and dialogs only.
Critical validation is in `lib/case-workflow.ts`, used by the authenticated
`PATCH /api/cases/workflow` route. Existing generic case saves cannot inject a
workflow object or bypass closure on a case with a registered BA / SKP.

## Workflow

- Progress combines existing manual follow-ups, completed linked My Work and
  BA/payment/filing/closure actions in one time-ordered timeline. Existing open
  linked tasks, next actions, notes and PIC/due-date context remain available.
- BA / SKP popup records reference, actual date, outcome, result, selected tax
  byproducts, periods, whole-rupiah payable values, explicit revision requirements
  and internal targets. The supported taxes follow the approved mockup. BA closes
  discussion only. Results cannot be overwritten through this initial version;
  corrections require a separately reviewed amendment workflow.
- Positive byproducts create payment targets automatically. Instalments preserve
  whole-rupiah totals and month ends. A schedule with any receipt is protected
  from replacement. Unverified receipts reserve recorded amounts but do not count
  as paid; verification updates the original receipt, not a duplicate.
- All payable items must be verified paid before recording required revised-SPT
  submissions. Paid-but-unsubmitted revisions are visible in the Supervisor
  attention filter and expanded row. Only the assigned Tax PIC or leadership may
  record/verify payments, record submissions and finalize closure. Assigned ACC
  PICs and leadership may register results, payment plans and SPHP responses.
- Himbauan closes only after payment and required submissions plus an AR-issued
  SP3P2DK reference/date. Pemeriksaan keeps SPHP response and SKP separate and
  uses its own examination closure reference, not SP3P2DK. Its revisions must be
  explicitly selected; assessment alone does not imply a revised SPT.
- Internal payment/revision targets are not statutory deadline calculations.
  Existing case due-date behavior is unchanged. The overdue-payment filter is
  dashboard attention only: no new cron, push delivery or automated escalation
  messages are added by this phase.

## Saving And Concurrency

Workflow writes and existing spreadsheet writes share the per-case save queue.
Other cases remain editable. Values become authoritative in the browser only
after server confirmation; there is no business-data fallback to local storage.
Live case collections are also excluded from the demo cache so that BA, NTPN,
filing receipts and workflow history are not copied into browser storage. Offline
sample cases and existing account-scoped UI preferences keep their prior behavior.
Each request compares the last confirmed `tax_cases.updated_at`, including in
the final database UPDATE, so concurrent saves return a conflict rather than
replace another user's work. Stable request IDs plus payload fingerprints allow
safe retry of a committed action without creating another payment or event.

The case state and its audit snapshot are written in the same database statement
and transaction. Final closure updates the state, stage, completion date and
closed timestamp together. Sheet refreshes protect records with queued writes.
Expanded-panel refreshes preserve the follow-up input; they do not rebuild the
table, change column widths or reset horizontal scroll.

## My Work History

An AFTER row trigger on My Work records completion at the same time as the task
save. It snapshots the case ID, task UUID, title, completing PIC and timestamp.
Title edits and repeat saves of an already completed task do not create another
completion. Reopening adds a separate event; relinking retains the original case's
history and records the new link for an already completed task. The snapshot does
not cascade away when a task changes or disappears. Reopen/unlink events use
generic My Work attribution because the current task row has no reliable actor
field for those actions; the old completer is not misrepresented as that actor.
Where an older completion has no completing PIC recorded, its snapshot explicitly
shows Unknown completer, rather than assuming the task creator completed it.

Existing completed links are snapshotted once during migration, without changing
tasks, generating points or sending announcements. Existing completed-task reads
remain the fallback before migration. Snapshot task IDs prevent double-rendering
the same current completion. Successful My Work saves invalidate affected case
progress caches; unconfirmed local completions do not enter the live timeline.

### Rapid My Work Edits

The browser save queue must not schedule a new revision merely because an older
queued revision finishes while another edit is pending. Each user edit already
enqueues its save; self-enqueueing here creates an unbounded POST/PATCH chain.
The queue now drains existing work, skips confirmed no-op payloads, and preserves
assignment/favorite writes. Checklist snapshots are deep-copied so toggling a
local step cannot mutate the last confirmed comparison baseline. Failed saves
retain edits with Retry/Review rather than leaving the drawer on Saving.

My Work keeps one compact, consistently sized save-status row for Saved, Saving
and Retry/Review; it never becomes a padded task card. The viewport-height desktop
panel and its independently scrolling detail drawer prevent status changes or long
task checklists from stretching the page. Mobile retains its existing overlay and
viewport-height rules. Status changes do not replace task inputs or move focus.

Confirmed parent/step completion, reopening or case relinking invalidates timeline
history. Title/note/preference saves and adding unchecked steps retain its cache.
The queue still drains without self-enqueueing; the subtask extension below does
not add separate per-step API requests or block the rest of the task drawer.

### Completed Subtasks

Apply `20261110080458_case_subtask_timeline.sql` before deploying the corresponding
My Work/Cases API update. Existing task contents are not rewritten. New steps have
stable IDs; legacy steps project deterministic `legacy:<task-id>:<index>` identities
until their first ordinary save. Case timelines use the existing history query and
pagination, not an extra subtask query. Subtask history does not require the parent
task to be completed, and never marks the parent complete automatically.

The server validates IDs/titles/checkboxes, discards client-supplied history/actors,
and stamps the verified actor plus a fresh `step_change_id` into the same task
UPDATE. A security-invoker AFTER trigger writes immutable completion/reopen events
into `tax_case_task_timeline` in that transaction. All existing task authorization
and version/CAS checks stay in place. No-op step saves, task title/note changes,
step renames/reordering, and parent completion do not duplicate checked-step events.
Repeating tasks start with new, unchecked step identities rather than copying old
completion credit. Deleting a step or unlinking the task retains recorded history.

Previously checked steps are snapshotted once as `step_snapshot`, with null event
date and explicit unknown completion PIC. This preserves evidence that they were
already checked without claiming today's date or attributing work to the creator.
The case timeline labels these historical entries and shows the parent task as
context. Unknown-date snapshots neither reset case inactivity nor become the newest
dated progress in printed reports. Actual new step completions do appear in report
progress, including parent context and the completing PIC/date.

Relinking a task retains old-case history; already completed steps appear as
undated historical snapshots in the new case, not fresh work. An old server that
does not stamp the new transition token cannot reuse a previous writer's identity;
the trigger records Unknown PIC for an otherwise observable transition. No extra
points, announcements or notifications are awarded for checking steps.

Migration risk: the short DDL lock can briefly wait for active task writes; a
five-second lock timeout prevents an unbounded wait. The timeline event identity
index now includes the step ID so checking multiple steps atomically cannot collapse
them into one event. Existing parent events, source rows and server-only RLS/grants
are preserved. Rollback application presentation only if needed; retain the new
history and IDs, and never delete recorded work to reverse this feature.

Coverage: `my-work-subtask-timeline`, updated `my-work-save-queue`, case reporting,
and the rolled-back PostgreSQL fixture `tests/my-work-subtask-timeline.sql`.

Hosted rollout on 10 November 2026: explicitly approved migration
`20261110082221_case_subtask_timeline` corresponds to the local migration above.
Verified the existing five tasks, Case records and four parent timeline events
retain their original checksums. Three checked steps received undated historical
snapshots, with none missing. Transactional fixture tests passed locally and on
Supabase; all synthetic task/events were rolled back. Application deployment is
still required for the new timeline rendering and attributed future step saves.

## Migration And Rollout

Apply `supabase/migrations/20261105055510_case_workflow_and_task_timeline.sql`
only after a verified backup and project identity check. It adds:

- Nullable `tax_cases.case_workflow` JSON state; no existing case is converted.
- Append-only `tax_case_workflow_audit` snapshots and `tax_case_task_timeline`.
- Invoker-security triggers with empty search paths. History tables have RLS,
  no public/anon/authenticated grants, and only SELECT/INSERT for service_role.

Do not run an unreviewed `supabase db push`: the existing project ledger differs
from older local migrations. Apply this specific reviewed migration through the
normal controlled process, then deploy. Before migration, the old sheet and
follow-ups continue to work; workflow writes remain disabled with an explanation.
The old application may continue to edit ordinary case fields during a rolling
deploy; the new server protects managed closure independently of the new UI.

Risk: an unexpected trigger failure rolls back the task/workflow save, deliberately
avoiding a successful save without its history. History consumes additional
storage and protects referenced cases against permanent deletion. Roll back code
if necessary but do not drop the new history tables or rewrite existing BA/payment
records. A completed-record amendment/correction flow is explicitly deferred.

Post-migration checks (read-only):

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='tax_cases' and column_name='case_workflow';
select to_regclass('public.tax_case_workflow_audit'), to_regclass('public.tax_case_task_timeline');
select has_table_privilege('anon','public.tax_case_task_timeline','SELECT') as anon_read,
       has_table_privilege('authenticated','public.tax_case_task_timeline','INSERT') as direct_staff_write,
       has_table_privilege('service_role','public.tax_case_task_timeline','UPDATE') as server_rewrite;
```

Expected: column/tables exist and all three privilege checks are false. Validate
one authorized synthetic case through BA -> payment -> submission -> SP3P2DK,
one denied non-PIC write, a linked task completion, reopen and relink, and ensure
the original column widths/paste/full-screen controls still work.

Tests: `tests/case-workflow.test.ts`, expanded `tests/case-control-sheet.test.ts`
and `tests/sql/case-workflow-fixture.sql`. The SQL fixture creates a minimal schema
and roles and must run only in a fresh disposable LOCAL database, never Supabase.

## Production Rollout: 5 November 2026

Applied to project `kedpcolyklquhfjzimvx` after explicit user approval and a
verified private local snapshot of the affected tables. The snapshot contains
16 case records and 4 My Work records, is excluded by `.gitignore`, and remains
at `tmp/private-case-workflow-pre-migration-20261105.json`. It is an affected-table
data snapshot, not a full-project backup; no client/task contents are committed.

The hosted migration ledger entry is
`20261105065156_case_workflow_and_task_timeline`, corresponding to the reviewed
local file `20261105055510_case_workflow_and_task_timeline.sql`. Do not reapply
the local file just because its timestamp differs from the hosted ledger.

Post-migration checks confirmed unchanged source-table counts and checksums,
2 completed-task snapshots with none missing, no initialized workflow on any
existing case, and no workflow audit entry from the migration itself. Both new
triggers are enabled. Both history tables have RLS, no anonymous/authenticated
read or write grants, and only SELECT/INSERT for service_role. Both trigger
functions are invoker-security with empty search paths and are not directly
executable by anonymous/authenticated users.

Security advisors added only informational RLS-without-policy findings for the
two intentionally server-only history tables; the prior warnings about older
functions and Auth configuration were unchanged. Those existing findings remain
a separate hardening task. Production verification here used schema/data checks,
not a synthetic business transaction committed into a real client case.

## SPHP, Assessments And PSA Extension

The approved assessment mockup is integrated into the existing Cases renderer,
not embedded as a separate demo. The original Himbauan and Pemeriksaan column
sets, ranges/paste, native scroll, width preferences, filters and account-bound
Full Screen remain. Two sibling tabs expose SKP & STP and Penalty Removal with
combined PIC/search/outcome filters, sortable parent controls and saved widths.
Both registries derive from the same accessible case workflow records.

For new Pemeriksaan, `close-examination` requires SPHP No.; the actual SPHP date
is optional. It marks the examination stage Closed, preserving its reference in
`examinationClosure`. Optional staged assessments commit atomically with closure;
issued documents may also be recorded later. This is NOT `workflow.final`: the
assigned PICs can still add/edit assessments and the Tax PIC/leadership can
record payments and PSA. Generic case POST/PATCH cannot bypass SPHP closure or
rewrite its date/category. New `record-result` SKP commands are rejected with a
refresh/workflow explanation; Himbauan BA and final SP3P2DK remain unchanged.

An assessment is metadata on exactly one existing workflow product, with its
stable product ID, type, issue reference/date, principal, penalty and optional
PSA application. `product.amount = principal + penalty`; the existing schedule
and receipt machinery continues to reference that product ID. A repeated tax
type is allowed across different assessment documents. Duplicate type/reference
pairs within the case, invalid/future dates and unsafe totals are rejected.
New documents start as inline draft rows. They are clearly unsaved until Save
new row succeeds; invalid or failed drafts remain editable and can be cancelled.
Drafts live only in memory, block opening a misleading Full Screen copy, and
trigger an unload warning. Confirmed cell edits serialize through the same case
queue; a neighbouring editor's text/caret survive saves and history refreshes.

Existing SKP results, products, schedules, receipts and final closures are not
rewritten or automatically copied. An open legacy workflow can record SPHP and
explicitly classify an existing product into the register. Classification must
preserve its total and IDs, including receipts. Previously finalized legacy
workflows remain read-only, pending a separately reviewed correction process.
This avoids creating another payable balance from an old SKP record.

PSA routing is atomic per case and preserves source documents. Requested amounts
cannot exceed their assessed penalties. Submitted applications require reference
and actual date; their original details cannot be overwritten or reset to Draft.
Draft routing may be returned. Decisions require reference/date and a matching
full, partial or zero (rejected) grant. Decisions cannot be overwritten. The
per-case PSA pane and Penalty Removal read the same application, including
ongoing/successful/rejected counts. Requests and decisions do not automatically
reduce assessed liabilities or verified payment balances. Multiple attempts,
appeals, cancellations and monetary adjustments require future audited actions.

Manual follow-ups can be removed as incorrect by their author or leadership,
provided they still have case access. The endpoint loads the original entry from
the same case, records reason/actor/time and retained text in `removedProgress`,
and appends a workflow event. Restore is separately audited. The original
`tax_case_progress_entries` row is never deleted. Hidden entries are excluded
from the active timeline and report progress; removal/restoration history stays
visible. My Work, payment, filing and closure events have no deletion control.

All new actions use the existing per-case compare-and-swap queue, request IDs,
fingerprints and atomic workflow audit trigger. No local business-data fallback,
new dependency, point award, notification dispatch or database migration is
introduced. Only UI preferences are saved locally. A read-only hosted schema
check confirmed `case_workflow` is JSONB and the workflow/task-history triggers
are enabled; no hosted business record was changed for verification.

Rollout: deploy the API and renderer together, then refresh open dashboard tabs.
Test with an authorized synthetic case locally/staging, never fabricate a client
assessment/payment in production. Review before rollback: the old API does not
understand `examinationClosure` or PSA fields and must not be used to mutate new
workflow records. Retain the new server guards if rolling back presentation.
Automated coverage: `case-assessment-live`, expanded `case-control-sheet`,
`case-workflow`, `case-report-progress` and existing follow-up/My Work tests.
