# Monthly leadership report

KPI Overview includes the Monthly Report and a separate live PIC follow-up
watch. Access requires leadership and Management access. Reports use recorded
case follow-ups, completion events from My Work, and recorded case-linked
steps. A completion linked to a case appears in its history without counting
the task twice. Dates use WITA, from the start of the chosen month up to but
not including the start of the next one.

Finalization saves one immutable server-generated snapshot per closed month,
with the finalizer and timestamp. Reopening that month shows the saved copy.
Reports can be printed before finalizing, with the draft label retained.

Month-end case state relies on the currently recorded closure and archive
dates; historical case fields, reopens, or lost records cannot be reconstructed.
The report does not represent compliance totals, points, or undated work.

The follow-up watch uses currently open cases at least 30 days old and checks
activity by **each assigned PIC**. It does not infer missing work from a PIC
with no open cases, or from work recorded outside the supported case data.
It is a live review list, not a historical rating or a payroll input.

Apply `20261124075447_monthly_leadership_reports.sql` after the existing case
and My Work history migrations, before deploying. It creates a server-only
insert/read snapshot table and indexes the dated audit streams. No existing
rows are changed. Check index build timing on the target before applying to
busy tables. Do not grant browser access or permit updates to finalized rows.
