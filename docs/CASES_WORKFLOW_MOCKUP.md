# Cases Workflow Mockup

Open `public/cases-workflow-mockup.html` directly, or serve it with the existing
application. This remains a separate in-memory design review: no dashboard,
authentication, database, My Work or delivery integration is changed. Six fictional
cases use a fixed 3 November 2026 scenario date. Refresh/Reset restores them.

## Simplified Excel Layout

The register retains No., Wajib Pajak, No Surat, Tgl Surat, Tgl Terima, Perihal,
Tahun, Jatuh Tempo and both PICs, adding BA/Hasil and a compact case status.
The first columns stay pinned, letter/date/subject cells accept sample edits,
and native horizontal scrolling is retained. Expanded details use the visible
viewport width. No large KPI cards, separate work dashboard or decorative sidebar.
Register and popup dates display/accept dd/mm/yyyy independently of browser locale;
ISO input is also accepted and normalized internally. Invalid calendar dates are rejected.

Detail has three compact tabs: Progress (default), Payments & Instalments,
and Tax Execution. Progress keeps the dated ACC/Tax timeline beside the result
register. Search and ACC/Tax filters combine with Supervisor attention, Payment
due/overdue and Awaiting SP3P2DK filters.

## Proposed Himbauan Sequence

### Linked My Work

Completing a My Work task linked by case ID automatically contributes its title,
completing PIC and completion date to that case's Progress timeline. The timeline
labels the source My Work and retains its task ID; no duplicate manual progress
entry is needed. Open tasks do not count as completed progress. Task completion
never substitutes for BA, verified payments, filing receipts or SP3P2DK.

The existing production case-progress API already retrieves completed linked tasks;
this preview projects sample task completions into the combined timeline, rather
than copying task data into the manual log. Expand My Work preview on Sentosa to
add a sample task and complete it. This is in-memory simulation only, not a new
My Work/database integration. Production must display only confirmed completions
and preserve task/case identities and audit history; reopening or relinking a task
must not silently erase the historical completion event. That durable event policy
is not implemented by this sample.

1. Progress: Record BA & close discussion opens a result popup. Enter BA number,
   actual date, narrative result and selected tax byproducts: PPh Pasal 29,
   PPh Pasal 21, PPh Pasal 23, PPh Pasal 4 ayat (2), PPN. Each has its own
   period, whole-IDR payable and explicit revision requirement.
2. BA closes the discussion, not the final case. The exact payable lines populate
   Payments automatically, initially one internal target per positive byproduct.
3. Split unreceived byproducts into monthly instalments if needed. Exact totals
   and month ends are preserved. A schedule with any receipt cannot be replaced.
   Verified NTPN/receipt-backed payments reduce the relevant instalment; pending
   verification does not reduce balance. Verification updates the original receipt.
4. Only after ALL payable items are paid do Tax submission controls unlock.
   Paid-but-unsubmitted required revisions are visible to supervisor in the case
   status, filter and reminder preview, with a separately entered internal target.
   This is attention visibility, not an actual push notification or legal deadline.
5. Record each required revised SPT submission date and receipt reference.
6. After payment and required submissions, record AR-issued SP3P2DK number/date.
   Only this last action marks the Himbauan case Closed. BA, receipts, revisions,
   SP3P2DK and timeline remain distinct. Final dates cannot precede prerequisite
   completion dates. Confirmed no-tax/no-revision results still require SP3P2DK.

The SP3P2DK label/sequence follows the user's proposed operational workflow;
the mockup does not assert statutory requirements, calculate legal deadlines or
validate document authenticity. Internal payment/revision targets are not changes
to official due dates. All amounts, references and targets are fictional.

## Pemeriksaan

SPHP response is recorded separately and does not automatically create an SKP.
Record the SKP result explicitly to create payable lines. Revision is NOT selected
automatically for Pemeriksaan. SP3P2DK is not required by this sample's examination
path; it uses a separate closure reference after settlement/explicit revisions.

## Try It

- Sentosa: record a new BA and follow its byproducts through payment and Tax.
- Pesisir: partial instalment, remaining unpaid byproduct, receipt verification.
- Lestari: all paid but revision pending; supervisor attention is visible.
- Harmoni: all paid and revised; enter SP3P2DK to close the case.
- Mandala/Samudra: inspect the separate SPHP/SKP examination path.
- Reminder preview is simulated; no messages or browser permissions are requested.

Regression tests: `tests/cases-workflow-mockup.test.ts`. No schema migration or
dependency is introduced. Production adoption needs reviewed server-side rules,
authorization, durable history and reminder scheduling; client-side mockup checks
are not a production security boundary. BA amendment after creation is deliberately
not offered; a future reviewed amendment flow must preserve payment history.
