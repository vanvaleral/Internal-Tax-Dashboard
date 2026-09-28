# AGENTS.md

## Project Identity

This repository is evolving into an internal Indonesian Tax Practice Management System.

It is not a generic task manager.

## Core Product Principles

- Data integrity is more important than UI convenience.
- Cases and recurring compliance are separate business concepts.
- Annual compliance should also remain distinct from recurring monthly compliance.
- Tasks may belong to cases, annual controls, or recurring obligations.
- Deadlines should be centrally managed and preferably configurable.
- Tax rules can change.
- Important actions require audit history.
- Authorization must be enforced server-side.
- Prefer archive/soft-delete for important records.
- Prefer simple maintainable architecture over over-engineering.
- Do not introduce dependencies unnecessarily.
- Inspect existing code before creating duplicate functionality.
- Critical business logic requires tests.
- Existing good UI should be preserved.
- Avoid unrelated refactoring during feature implementation.

## Current Repository Reality

- The active UX prototype currently lives primarily in `public/demo.html`.
- The Next.js route layer currently serves that demo through an iframe-based shell.
- The Supabase schema currently supports only a narrow recurring-compliance prototype.
- Attendance automation is intentionally isolated in `server/` plus Next proxy routes.

## Working Rules For Future Changes

Before implementing a phase:
- read the relevant files in `docs/`
- inspect affected existing code
- explain intended changes
- identify migration implications
- avoid unrelated refactoring
- update tests where business logic changes

## Architecture Direction

Target modules:
- Clients
- Recurring Tax Compliance
- Annual Compliance
- Tax Cases
- Tasks / Next Actions
- Review & Approval
- Activity / Audit Trail
- Management / Reporting

## Migration Caution

Do not make destructive database changes without:
- documenting migration strategy
- documenting risks
- preserving operational history where relevant

## UI Guidance

- Preserve visual consistency with the current product direction.
- Optimize for scanning, sorting, filtering, and fast updates.
- Favor evolutionary improvement over redesign for its own sake.
