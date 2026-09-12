# IMPLEMENTATION ROADMAP

## Phase 0 — Audit and Documentation

Deliverables:
- `docs/SYSTEM_AUDIT.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/USER_ROLES.md`
- `docs/WORKFLOWS.md`
- `docs/BUSINESS_RULES.md`
- `docs/UI_REQUIREMENTS.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `AGENTS.md`

Reason:
- the repository already contains meaningful product direction
- implementation should follow documented evolution, not improvised rebuilding

## Phase 1 — Foundation: Auth, Roles, Client Master, Data Integrity

Priority:
- highest

Scope:
- define real user-role model
- enforce server-side authorization
- expand client master schema
- add dual PIC structure to persistence
- align demo ownership concepts with real backend model
- establish migration workflow

Reason:
- the largest risks today are authorization, persistence mismatch, and weak client foundation

## Phase 2 — Tax Case Management

Scope:
- create persistent case schema
- define configurable case types where useful
- implement case list/detail/workflow foundation
- preserve existing cases UI direction where possible

Reason:
- cases are currently fully demo-only and are a separate business concept

## Phase 3 — Recurring Tax Compliance Engine

Scope:
- evolve recurring schema from simple task table into a stronger obligation model
- add internal/statutory deadlines
- add clearer workflow states and next actions
- keep duplicate-safe generation

Reason:
- recurring compliance is core, but should be built after client/role foundation is stable

## Phase 4 — Task / Next Action System

Scope:
- implement generic task engine
- support tasks from recurring obligations and cases
- create My Work view

Reason:
- tasks should be derived from real parent records, not added prematurely

## Phase 5 — Review & Approval

Scope:
- add preparer/reviewer model
- add revision/approval history
- support review queues

## Phase 6 — Activity / Audit Trail

Scope:
- create durable activity log model
- log important operational changes
- surface record history in UI

Reason:
- this is critical, but it becomes more valuable after real domain records exist

## Phase 7 — Dashboard Refinement

Scope:
- refine management dashboard using real persisted exceptions
- remove reliance on purely demo-derived summaries

## Phase 8 — Notifications / Escalations

Scope:
- add in-app notification model
- deadline reminders
- blocked/review escalation logic

## Phase 9 — Workload & Reporting

Scope:
- build workload model
- effort points if approved
- reporting by staff, client, case type, and exception category

## Phase 10 — Advanced Automation / Integrations

Scope:
- document integrations
- optional scheduled jobs
- future external notifications if explicitly approved

## Why This Order

This order is safer than jumping straight into feature expansion because:
- the repository currently lacks strong auth/roles and durable domain foundations
- the UI has already outrun the database model
- building cases or advanced compliance features first would increase rework risk

## Recommended First Implementation Phase

After approval, start with:

### Phase 1

Specifically:
- client master expansion
- role and permission enforcement
- database migration discipline
- recurring/domain ownership cleanup

This phase unlocks safer evolution of every other module.
