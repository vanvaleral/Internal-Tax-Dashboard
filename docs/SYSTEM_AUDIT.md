# SYSTEM AUDIT

## Existing Architecture

### Delivery shape
- The repository is a hybrid of:
  - a Next.js App Router shell
  - a large standalone prototype in `public/demo.html`
  - a Supabase/PostgreSQL starter schema

### Frontend architecture
- The user-facing application route layer is extremely thin.
- `app/page.tsx`, `app/dashboard/page.tsx`, and `app/login/page.tsx` all render the same `DemoFrame`.
- `components/demo/demo-frame.tsx` embeds `public/demo.html` in an `iframe`.
- This means the real product behavior currently lives mostly in one large HTML/CSS/JavaScript file rather than in React components.

### Backend architecture
- Business data mutations on the Next.js side are limited to server actions in `app/actions.ts` for the old kanban-style compliance board.

### Database architecture
- There is one SQL bootstrap file: `supabase/schema.sql`.
- The schema currently supports only a narrow recurring compliance task model:
  - `staff_profiles`
  - `clients`
  - `client_tax_profiles`
  - `tax_periods`
  - `compliance_tasks`
  - generated view `compliance_board`
- No schema exists yet for:
  - annual compliance
  - tax cases
  - tasks/next actions as a separate engine
  - review/approval
  - immutable audit history
  - notifications/escalations
  - workflow templates/configuration
  - document references

### Authentication and authorization
- Supabase client/server helpers exist.
- Middleware initializes a Supabase client if env vars are present.
- There is no enforced login flow, protected route model, role gate, or row-level security policy implementation in the repository.
- Permissions are not enforced server-side for the intended business model.

### Runtime model
- The current live experience is demo-first.
- If Supabase is absent, the app falls back to in-memory demo data.
- The UI has many conceptual modules, but they are not yet backed by durable domain models.

## Existing Features

### Features implemented in the HTML demo
- Workspace shell with:
  - Operations
  - Cases
  - Clients
  - Management
- Monthly compliance matrix
  - one client = one row
  - grouped obligation cells
  - inline expansion for obligation ledger details
  - follow-up/data status controls
  - sorting and filtering
  - completed history
- Annual compliance section
  - accounting annual control
  - tax annual control
- Cases workspace
  - list and kanban-oriented case visualization
- Clients workspace
  - active clients
  - proposal/quotation
  - contract monitoring
  - fee analytics placeholder
- Management workspace
  - dashboard-style oversight views
- Lightweight note popovers
- CSV client import template and demo import flow

### Features implemented in React/Next + data layer
- Legacy recurring compliance board data fetch from Supabase view `compliance_board`
- Dashboard stats derived from recurring tasks
- Server actions for:
  - moving task status
  - increment/decrement follow-up
  - saving receipt number

## Strengths

### Product thinking strengths
- The product direction is operationally specific, not generic SaaS fluff.
- The demo has evolved toward client-centric operational control rather than a Trello clone.
- The separation between monthly compliance, annual compliance, cases, clients, and management is directionally correct.

### UX strengths
- The existing demo already reflects many good operating-system ideas:
  - dense matrix scanning
  - inline updates
  - compact note interactions
  - dual PIC visibility
  - role-aware intent
  - mobile-specific layout adjustments
- The UI is reasonably polished and should not be discarded.

### Technical strengths
- There is an initial recurring-generation concept in SQL.
- Duplicate prevention exists for recurring task generation through unique constraints.
- The project already includes local launch scripts and basic deployment orientation.

## Weaknesses

### Critical architectural weakness
- The application is still demo-centric.
- Core product behavior lives in `public/demo.html`, not in maintainable typed React modules.
- This creates:
  - fragile DOM/event logic
  - limited reusability
  - weak testability
  - difficult server-side enforcement
  - poor separation of concerns

### Domain-model mismatch
- The current SQL schema represents only recurring compliance tasks.
- The current UI concept already contains:
  - annual accounting control
  - annual tax return control
  - cases
  - proposals
  - fee terms
  - notes and pseudo-history
- These concepts do not exist as persistent, normalized tables yet.

### Authorization weakness
- No real role/permission model is enforced.
- Current “visibility” is primarily demo state behavior.
- The future role model in the brief cannot be safely supported by the current backend.

### Audit/history weakness
- The demo simulates change logs for some annual accounting fields.
- There is no durable, immutable activity log table or event model.
- Important history can still be lost because it lives in in-memory demo objects.

### Workflow inconsistency
- The SQL task model uses one fixed status enum for monthly compliance.
- The demo uses richer operational state ideas and separate annual/case flows.
- There is no centralized workflow/template engine yet.

### Maintainability weakness
- `public/demo.html` is very large and contains:
  - styling
  - data
  - navigation
  - business rules
  - event handlers
  - state/history logic
- This file is useful as a UX prototype but not a strong long-term application architecture.

### Testing weakness
- No automated tests were found.
- No domain-level validation tests exist for:
  - recurring generation
  - workflow transitions
  - deadline logic
  - permission rules
  - audit-trail behavior

## Missing Features

Compared with the requested Tax Practice Management System direction, the repository is missing or incomplete in the following areas.

### Client master
- No authoritative persistent client master with the required fields:
  - partner
  - supervisor
  - engagement dates
  - service package
  - industry
  - team assignment model
- No configurable admin-managed tax obligation taxonomy.

### Recurring compliance engine
- No configurable workflow engine.
- No separate internal vs statutory deadline model.
- No next-action engine.
- No reviewer assignment in recurring obligations.
- No blocker/owner/next-action deadline persistence.

### Monthly tax control
- The demo view exists conceptually.
- The persistent backend model does not match the richer client-row operating model currently shown in the UI.

### Case management
- No persistent case tables or workflows.
- Cases are currently demo-only.

### Tasks / My Work
- No standalone task engine.
- No real “My Work” backend page or workload inbox.

### Review and approval
- No durable preparer/reviewer workflow.
- No approval history tables.

### Activity log / audit trail
- No immutable or protected event log.

### Deadline engine
- No centralized configurable deadline rule system.
- Current SQL generation uses `due_day` per tax profile only.

### Notifications and escalations
- No notification engine or escalation rule persistence.

### Workload management
- No effort points or workload model.

### Document reference system
- No persistent document reference schema.

### Roles and permissions
- No complete role model for Admin, Partner, Supervisor, Team Leader, Staff.
- No server-side authorization policy implementation.

### Configuration
- No generalized configuration tables for case types, workflow stages, deadline rules, notification rules, effort points, or priorities.

## Technical Debt

### High technical debt
- `public/demo.html` as the operational core
- duplicate product concepts across:
  - demo HTML
  - Next shell
  - Supabase starter schema
- legacy board-oriented React components that no longer represent the intended product
- thin login/dashboard routes that are not true module pages

### Security debt
- no real authenticated application boundary
- no role-based server checks
- no RLS setup in schema

### Data integrity debt
- no migrations directory or managed migration workflow
- no audit/event storage
- no soft-delete/archive strategy for important future records
- no durable persistence for current annual/cases/client-management demo data

### Operational debt
- no test suite
- no lint/type/test workflow documented for delivery phases
- no domain-service layer yet for recurring vs case vs task separation

## Database Assessment

### What the current schema can support well
- a basic recurring compliance task board
- period-based obligation generation
- simple follow-up counting
- receipt number tracking
- simple dashboard aggregation for recurring tasks

### What the current schema cannot support well
- client master as the single source of truth for the broader system
- dual PIC ownership at the schema level
- annual accounting control
- annual tax return control
- non-recurring cases
- tasks as child work items generated from multiple parent record types
- review and approval history
- immutable activity logs
- configurable workflows
- configurable deadlines
- notification rules
- document references
- partner/supervisor/team leader role visibility and ownership

### Assessment
- The current schema is a useful prototype foundation for recurring monthly compliance only.
- It is not sufficient as the long-term database model for the full Tax Practice Management System.
- It should be evolved, not discarded, but it needs major expansion and normalization.

## Recommended Changes

### Critical
- Move the system from demo-only operational state toward real persisted domain models.
- Implement real authentication and server-side authorization.
- Introduce durable audit history/event logging.
- Separate recurring compliance and tax cases into distinct backend business objects.
- Define a real authoritative client master schema.
- Establish a migration-based database workflow.

### High
- Create persistent case management tables and workflows.
- Create persistent annual compliance models for accounting and tax.
- Add configurable workflow and deadline rule structures where they materially reduce hard-coding.
- Introduce next-action/task modeling linked to recurring obligations and cases.
- Add review/approval tracking.

### Medium
- Migrate major `public/demo.html` modules incrementally into typed React components and server-backed data flows.
- Add workload reporting foundations and configurable effort points.
- Add document reference handling.

### Low
- Further visual polish
- deeper management analytics
- advanced integrations
- external notifications

## Summary Judgment

This repository contains a valuable product prototype with strong operational direction and a reasonably good UI, but it is not yet a robust practice-management application.

The strongest existing asset is the evolving operational model embodied in `public/demo.html`.

The largest gap is that the real application architecture, schema, permissions, and auditability still lag far behind that UI vision.

The safest path is:
- preserve the current UX direction
- document the current and target models clearly
- build the backend/domain foundation in phases
- migrate the most important modules off demo-only state incrementally
- avoid wholesale rewrites unless a specific module truly requires it
