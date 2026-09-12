# BUSINESS RULES

## Current Rule Reality

Business rules currently exist in three places:
- SQL generation logic in `supabase/schema.sql`
- Next data utilities in `lib/data.ts`
- extensive client-side logic in `public/demo.html`

This rule duplication is a major long-term risk.

## Existing Important Rules

### Recurring generation
- recurring tasks are generated from `client_tax_profiles`
- generation avoids duplicates via unique constraints

### Follow-up counting
- follow-up count cannot go below zero
- increment updates last-follow-up timestamp

### Completion logic
- completion is partly status-based in persisted recurring tasks
- completion is also derived in demo monthly compliance logic

## Required Future Business Rules

### Client master
- clients should archive rather than disappear when operational history matters
- client tax applicability drives recurring generation

### Recurring compliance
- separate statutory deadline vs internal deadline
- recurring generation must be deterministic and duplicate-safe
- next action should be explicit
- blockers should be visible

### Cases
- case types may have different workflows
- not all cases share the same lifecycle

### Review
- approvals and revision requests must be retained historically

### Audit
- important actions must be logged
- operational history should not silently disappear

### Authorization
- access must be server-side enforced

## Recommended Rule Ownership

Over time, important business rules should move toward:
- database constraints for integrity
- server/domain services for workflows and permissions
- UI only for presentation and user interaction

## High-Risk Rule Problems Today

- workflow/state logic duplicated in multiple places
- monthly compliance logic in demo does not match persisted recurring task model
- annual and case flows are demo-only, not authoritative
- no central deadline engine

## Recommended Priority Rules to Centralize First

1. client ownership and visibility rules
2. recurring generation rules
3. workflow transition rules
4. audit/event creation rules
5. deadline calculation rules
