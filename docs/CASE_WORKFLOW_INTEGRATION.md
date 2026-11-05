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
