# SKP / STP And PSA Mockup

Standalone preview: `public/cases-assessment-mockup.html`. It reuses the existing
Cases preview styling, not the live dashboard renderer. All clients, references
and amounts are fictional. Edits live in document memory only; refresh or Reset
restores the examples. No API, Supabase, notification, points or storage writes.

## Proposed Interaction

- The preview opens in a functional Pemeriksaan tab, with two already-closed
  examples and one open case. Add new examinations here, not as duplicate parent
  controls in the SKP/STP register.
- Closing is an explicit action. SPHP No. is required; entering it alone does
  not automatically close the case. The SPHP date is optional in this draft.
  The close dialog enables SKP/STP draft entry only after a nonblank SPHP number.
- Byproducts are optional at closure because documents may be recorded later.
  All staged documents must have reference/date/tax/period if included. Duplicate
  staged references are rejected. Cancellation or validation failure leaves the
  case and shared register unchanged; confirmation closes and links in one step.
- Closed Pemeriksaan remains expandable. Users can add and edit SKP/STP there
  later; both tabs reference the same document objects and assessment IDs. A
  closed case with no documents appears as Awaiting documents in SKP/STP.
  Closed SPHP references are read-only pending a future audited correction flow.
- This internal SPHP closure does not declare tax liabilities paid or PSA complete.
- One parent row per client / audit, retaining the examination reference and year.
- Expand the number or client to see multiple SKP/STP records. Add either type as
  an inline blank row and edit tax, period, reference, issue date, principal and
  penalty. Whole-rupiah grouping and day-first dates remain explicit.
- Combine ACC/Tax filters, document type and search; reset filters and client sort.
- Select individual documents or all eligible documents in that expanded group.
  Filtering removes hidden selections. Documents already in PSA cannot be routed
  twice. A reference, issue date and positive penalty are required for demo routing.
- Move to PSA confirms the selected references/penalties. The original assessment
  remains in the source register marked In PSA; the PSA tab holds its linked draft
  request, not a second assessment or another payable balance.
- In PSA, edit requested reduction, application reference/date, progress and note.
  The requested amount cannot exceed the original penalty. Lowering an original
  penalty below an existing request is rejected. Draft routing can be returned;
  submitted requests require a future amendment/cancellation workflow instead.
- Pemeriksaan expands into Progress, Payments & Instalments, and PSA. Progress
  contains linked My Work, manual follow-ups and the shared SKP/STP document list.
  Completion/reopening of a demo task adds a sourced event exactly once per state
  transition. Neither task completion nor manual progress closes the examination.
- The PSA pane and Penalty Removal reference the same application objects. Both
  show ongoing, successful and rejected counts; Penalty Removal adds an outcome
  filter. Successful includes fully and partially granted requests, distinguished
  by their recorded decision. An application reference/date and submitted status
  precede decision entry. Decision proof/date and grant amount are required.
  Rejected decisions have a zero grant; partial grants must be strictly below the
  requested amount. Recorded decisions are view-only, not overwritten in place.
- Payments use each source assessment once, with whole-rupiah instalment splits,
  month-end-safe internal targets and proof-backed demo receipts. Overpayment is
  rejected. Recorded receipts prevent rescheduling. Assessment amounts cannot be
  silently changed once a payment schedule exists. No PSA request or decision
  reduces the original assessment or payable balance automatically.
- Manual timeline notes can be removed as incorrect and restored from Removed
  updates. This is a recoverable removal, not permanent deletion. My Work, payment,
  decision and closure events retain their source history and have no remove
  control here. Production removal/correction needs server-side authorization,
  recorded actor, timestamp and reason, not just a hidden timeline item.
- The Himbauan preview links to this updated Pemeriksaan preview. Its BA action
  is beside, and immediately left of, In progress. It also supports recoverable
  manual-note removal while retaining its existing BA/payment/revision/SP3P2DK
  sequence. Both previews remain sample-only and reset on refresh; navigation
  between the two standalone pages does not persist in-memory edits.
- Narrow screens render document fields as two-column cards inside the expanded
  viewport, while the parent spreadsheet retains native horizontal scrolling.

This is a workflow concept, not a legal eligibility/deadline calculation. Routing
does not automatically suspend or change payment obligations. Status/amount fields
are illustrative and do not submit applications to the tax office.

## Before Production

This preview deliberately makes no changes to live Himbauan/Pemeriksaan,
payments, timeline, column-width preferences, authorization or closure records.
It is not a replacement production sheet or a complete Excel interaction engine.

Agree the document/application fields and application grouping first. Production
needs stable UUIDs for assessments and PSA applications, links to the existing
client/audit, server-side PIC/leadership permissions, version-checked writes and
retained audit history. Reuse the same assessment/payment identity when migrating
existing Pemeriksaan SKP results; do not duplicate their existing liabilities.
The production examination closure currently uses a different workflow. Moving
its control endpoint to SPHP requires an explicit server-side transition, not
just changing a status label; existing SKP/results/payment history must survive.
Multiple application attempts, official decisions, corrections and cancellation
history must not overwrite an earlier submitted request. Existing source records
must remain traceable when routing or returning work between tabs.

No database migration is part of this mockup. Automated interaction coverage is
in `tests/cases-assessment-mockup.test.ts`. Browser visual inspection was blocked
by the tool's local-file URL policy; no alternate browser surface was used.
