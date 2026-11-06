# Allocation Difficulty And Capacity Preview

Open `public/allocation-capacity-demo.html`. This standalone concept does not
change the dashboard, schema, Client Master or any saved allocation. It uses
12 fictional clients, 6 fictional staff and November 2026 illustrative monthly
estimates. Everything is held in memory; Refresh / Reset demo restores the sample.

Tax and Accounting have separate applicability, difficulty, hours, PIC and reviewer
notes. Difficulty is 1 Routine through 5 Specialist; blank means Unrated. Monthly
hours are an estimated normal recurring workload, not a timesheet requirement or
reward points. Blank effort remains unknown, while an explicit zero remains zero.

Staff availability is net delivery capacity after leave/internal duties; Other
work separately represents estimated Cases, Annual or support effort. Load is
(known client hours + other work) / available hours. Missing client estimates
produce an At least percentage and a visible incomplete-data flag. Zero capacity
shows No capacity rather than an infinite percentage. Skill-fit flags compare a
client's difficulty with the PIC's assessed independent working level, not their
job title. Neither flag is a performance ranking or an automatic reassignment.

## Try It

- Tax: Citra starts at 102h / 80h = 127.5%. Stage PT Nusa Retail to Bima:
  Citra becomes 78h / 80h = 97.5%; Bima becomes 72h / 100h = 72%.
- Move CV Samudra Niaga to Bima to see a level-4 vs level-3 support warning.
  Review requires a reason/support plan for flagged allocations; no silent override.
- Ayu has a missing client estimate. Farah's Accounting estimate is also incomplete.
  Their displayed percentages are lower bounds, not confident utilization figures.
- Click a PIC to filter clients; switch teams to assess their different processes.
  Select rows to stage one PIC for several clients. No PIC explicitly clears a
  proposed assignment; Not applicable excludes tax-only individuals from ACC work.
- Review compares both teams, including changes hidden by current filters. Apply
  in demo changes only this sample's current assignments and adds an activity event.
  Reset unsaved PIC changes clears both-team drafts but retains assessments.
- Supervisor can assess, edit capacity and allocate. Senior reviewer can assess
  but not allocate/edit capacity. Staff are read-only. This switch illustrates edit
  controls only: it is not production authentication or a staff-visibility policy.

## Production Decisions Still Needed

Calibrate the difficulty anchors and hour estimates with the team before using
capacity thresholds for decisions. Decide who may assess each discipline, define
staff visibility and independent-level ownership, and model named mentor/support
hours without double counting. A free-text support plan here is not a validated
mentor assignment. Other-work hours are manual sample estimates, not an automatic
integration with Cases or Annual controls.

Production would need server-side scope/role enforcement, stable client/staff IDs,
persisted dated assessments and capacity settings, and audit snapshots alongside
the existing yearly allocation history. It must preserve past PIC assignments and
not rewrite monthly/annual ownership or completed records. Unassessed clients must
never silently become easy/zero-effort; missing applicability or PIC must never
cause an automatic assignment. No migration is prepared or applied by this demo.

Regression tests: `tests/allocation-capacity-demo.test.ts`.
