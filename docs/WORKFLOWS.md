# WORKFLOWS

## Current Workflow Reality

There are currently two different workflow realities in the repository:

1. A narrow persisted recurring-task workflow in SQL and `lib/types.ts`
2. A much richer operational workflow model embedded in `public/demo.html`

These must be reconciled over time.

## 1. Recurring Monthly Compliance

### Current persisted workflow
The database currently supports:
- Awaiting Client Data
- Ready to Process
- Submitted Temporary
- Waiting Revision Data
- Revised & Finalized
- Archived

### Current demo workflow behavior
The demo also models operational state through:
- grouped obligation cells
- data-request states
- payable entered
- paid date entered
- NTPN entered
- reported/completed

### Recommended future workflow
Recurring compliance should evolve toward:
- Not Started
- Waiting for Client Data
- Processing
- Under Review
- Waiting for Payment
- Ready to File
- Filed
- Completed

This should eventually be configurable rather than permanently hard-coded.

## 2. Annual Accounting Workflow

The demo currently reflects a compressed annual accounting control.

Observed visible stages:
- Data Request
- In Process
- Financials Done
- Equalization
- Review
- Meeting
- SPT Ready
- Payment
- Reported
- Done

This is a useful operating model and should likely be preserved conceptually.

## 3. Annual Tax Workflow

The current annual tax sheet behaves more like a milestone/checklist table than a clean stage engine.

It should later evolve into a formal stage model while preserving the current high-density scanning behavior.

## 4. Tax Cases

Cases are currently represented only in demo state.

Recommended case workflow direction:
- Received
- Initial Review
- Data Request
- Analysis
- Draft Response
- Supervisor Review
- Client Approval
- Submission
- Follow-up
- Closed

Case workflows should be templated by case type where practical.

## 5. Review & Approval

Current repository state:
- no durable review workflow

Recommended generic review pattern:
- Prepared
- Submitted for Review
- Revision Required OR Approved
- Completed

## 6. Task / Next Action

Current repository state:
- no true standalone task engine

Recommended model:
- parent record
- description
- owner
- due date
- priority
- status
- blocker
- completion

## Workflow Design Principles

- recurring compliance and cases must remain separate business concepts
- annual control should remain separate from recurring monthly control
- workflow history must be preserved
- transitions should be validated
- deadlines should be centrally calculated where practical
