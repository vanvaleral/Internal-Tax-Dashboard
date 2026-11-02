# Partner Workspaces: Deferred Implementation Plan

Recorded: 2026-10-30 (Asia/Makassar).

Status: DEFERRED. Planning only; no workspace implementation or migration is
authorized by this document. The user's immediate priority is to verify that
existing features work correctly before undertaking this larger change.

## Resume Instructions

When asked to resume this initiative:

1. Read this document and the current project instructions.
2. Review the latest feature-audit findings, unresolved issues and user decisions.
3. Inspect current code, migration history and deployed schema again. Some older
   project documents describe an early prototype and are not a current inventory.
4. Confirm the open policy decisions below before implementing access or transfers.
5. Produce an additive migration strategy, backup/restore verification plan and
   isolation test plan before changing production data.
6. Implement in stages. Do not enable a second workspace before all relevant
   modules enforce workspace isolation.

Suggested future request:

> Resume docs/PARTNER_WORKSPACES_PLAN.md. First review the current feature audit
> and confirm the remaining access and transfer rules before implementing.

## Business Context And Confirmed Requirements

The application currently supports work under partner Dewa. In the future:

- A former supervisor may become a new partner with a separate practice workspace.
- Dewa may become Managing Partner with oversight of multiple workspaces.
- A partner or head may need authorized oversight of another partner's work.
- Employees must not encounter another partner's projects without explicit access.
- Existing clients may move from Dewa's practice to the new partner's practice.
- Existing employees may also move between partner workspaces.
- Clients and employees should retain their identities and historical records.
- The preferred direction discussed is one application with switchable workspaces,
  using the existing database with proper isolation rather than copying the site.

This is logical isolation in shared infrastructure, not physically separate
databases. Reconsider separate databases/deployments if practices become separate
businesses or require independent infrastructure, backups or administration.

## Big Picture

```text
Tax Dashboard: one application and shared login identities
|
+-- Dewa Workspace
|   +-- Members and workspace-specific permissions
|   +-- Clients and Allocation
|   +-- Cases, My Work, Monthly and Annual Compliance
|   +-- Claims, documents, announcements, points and reports
|
+-- New Partner Workspace
    +-- Members and workspace-specific permissions
    +-- Clients and Allocation
    +-- Cases, My Work, Monthly and Annual Compliance
    +-- Claims, documents, announcements, points and reports

Only authorized users can switch between workspaces.
Ordinary employees enter their permitted workspace automatically.
```

### Three Separate Relationships

| Concept | Meaning |
| --- | --- |
| Workspace ownership | Which practice currently manages a client or work record. |
| Workspace membership | Which workspace a person may enter and what they can do. |
| PIC assignment | Who handles a particular client, case, task or obligation. |

Changing one must not silently change the other two. Moving an employee does not
automatically move their clients. Moving a client does not automatically move its
employees. Changing a Tax/Accounting PIC is not a partner-workspace transfer.

A workspace needs a permanent ID independent of its partner's name or job title.
Promotions, ownership changes and display-name changes must not rewrite IDs.

## Proposed Access Model

The following is a recommendation, not a finalized permission specification:

| Person | Dewa workspace | New partner workspace |
| --- | --- | --- |
| Dewa as Managing Partner | Management access | Explicit firm-level management/oversight access |
| New partner | Read-only oversight if granted | Management access |
| Supervisor under Dewa | Management within assigned permissions | No access unless separately granted |
| Dewa employee | Assigned work within granted membership | No access |
| New partner employee | No access | Assigned work within granted membership |

- Treat viewing, editing, exporting, financial visibility and access management
  as separate permissions where appropriate.
- Oversight of another practice should be read-only by default.
- Becoming a partner must not automatically reveal every workspace.
- Roles must be workspace-specific: the same person can manage one workspace
  and have only oversight access to another.
- Membership is required before PIC/ownership rules can grant access. Historical
  authorship or an old PIC snapshot must not bypass revoked workspace membership.
- Global login identities may be shared; operational rosters/PIC dropdowns must
  reveal only permitted members.
- Tax rules and similar non-client reference settings may be shared deliberately;
  business data must not become shared merely for convenience.

## Implementation Roadmap

### Phase 1: Agree On Rules

Define an approved permission matrix and client/employee transfer policy. Resolve
the decisions at the end of this document. Document the distinction between
workspace operations, cross-workspace oversight and firm-level administration.

Deliverable: approved access-and-transfer specification.

### Phase 2: Prepare Database Foundations

Introduce workspace identities, workspace memberships and workspace ownership of
business records. Proposed concepts include `workspaces`, `workspace_memberships`
and a `workspace_id` relationship; final schema names require implementation review.

Map existing operational records to Dewa's workspace without recreating their
IDs. Preserve client/case/task links, annual external-subject IDs, original PIC
snapshots, claims, audit records and finalized reporting snapshots.

Monthly and Annual controls currently use shared operational-state containers.
Those containers must become workspace-specific, with keys/version checks scoped
by workspace and control type, not just a UI filter inside one shared payload.

Deliverable: additive migration design, reviewed backfill map, integrity checks
and verified recovery procedure. Do not blindly run pending local migrations.

### Phase 3: Enforce Isolation Across Every Module

Replace broad firm-wide leadership assumptions with workspace-specific permission
checks. Cover reads, writes and indirect access, including:

- Clients, proposals/contracts, imports, exports, duplicates and Allocation history.
- Cases, progress entries, linked tasks, archives and recovery actions.
- Monthly controls, generation, completion/history, claims and claim printing.
- Annual Accounting/Tax controls, external subjects, generation and custom columns.
- My Work ownership, assignment, recurring tasks, completion and archive access.
- Staff membership, registration/claim codes and access retention.
- Management, performance ledgers, report snapshots and financial information.
- Announcements, delivery recipients, push notification links and background jobs.
- Documents/attachments, storage paths, downloads and related audit records.

Validate the requested workspace against current server-side membership on each
request. A workspace ID from a header, URL or browser preference is not authority.
Use database policies/constraints and server checks together; privileged server
database connections can bypass RLS. Prevent cross-workspace parent/child links.

Deliverable: tested isolation, including direct API/database/storage paths, before
another partner's records are exposed through the application.

### Phase 4: Add Safe Workspace Switching

Show the current workspace clearly. Only authorized multi-workspace users receive
a switcher; ordinary employees do not see unauthorized workspace names or data.

Bind full-screen sheets, deep links, browser preferences, caches and pending
requests to both account and workspace. Finish pending saves before switching;
do not silently discard edits or send them to the newly selected workspace.
Invalidate old reads so late responses cannot replace the destination's data.
Keep tabs independently bound so switching one tab cannot redirect another tab's
writes to a different workspace.

Deliverable: one login with safe switching and unchanged familiar module layouts.

### Phase 5: Add Controlled Transfers

Create a management-only transfer flow supporting clients, employees or both in
one reviewed batch:

```text
Choose source and destination
             |
Select clients and/or employees
             |
Preview affected records, unfinished work and access changes
             |
Resolve PIC assignments and membership conflicts
             |
Approve and execute the transfer
             |
Verify the result and preserve an audit trail
```

Client transfers should retain the client ID and original responsibility history.
The proposed default is to transfer active work and the approved client-specific
history, without exposing unrelated source-workspace data. Finalized source
reports remain unchanged. Historical origin and current custody/access must be
distinguished explicitly in the eventual data model.

Employee transfers retain the login/profile identity. Review unfinished work,
grant the appropriate destination membership, and revoke source access unless a
specific handover/oversight grant is approved. An employee must not silently
retain cross-workspace access just because old records reference their profile.

Execute approved changes atomically where feasible; do not leave a half-completed
transfer. Record source/destination, affected IDs, approver, acting user and time.
For workflows too large for one transaction, define a recoverable, access-safe
state machine before permitting them. Avoid destructive delete/recreate flows.

Deliverable: preview, validation, approval, execution and auditable results.

### Phase 6: Keep Reporting And History Accurate

Operational screens and totals remain workspace-specific. Authorized leadership
may receive a separate overview across selected workspaces, not a mixed employee
working screen. Past PIC/partner attribution and already-earned point history
must remain accurate; promotions and transfers do not rewrite old achievements.

Finalized reports remain immutable snapshots. Confirm historical client-file
visibility and reporting cutoffs before choosing how transfer access is represented.
This phase does not authorize the separately deferred pending-points/milestone
scoring mechanism or convert report previews into live functionality by assumption.

Deliverable: workspace-specific reports and deliberately authorized oversight.

### Phase 7: Validate And Release Gradually

First run the application with only Dewa's workspace enabled. Verify IDs, row
counts, fees, assignments, links and existing workflows against the pre-migration
baseline. Then pilot a second workspace with a small, approved dataset/team.

Test denied access as thoroughly as permitted access: forged workspace IDs,
record-ID guessing, old full-screen tabs, late responses, exports, notifications,
documents, revoked memberships and attempted cross-workspace links. Test stale
saves and transfer failures without overwriting confirmed work.

Confirm backup restorability and an application/database rollback strategy before
production rollout. Keep history-preserving additions where needed; rollback must
not erase new audit history. Do not mark the initiative complete on UI tests alone.

## Transfer Example

Ivan and Client A move to the new partner while Client B remains under Dewa:

1. Preview Client A's active work and approved client-history access.
2. Confirm Ivan's destination role and Client A's destination Tax/Accounting PICs.
3. Review Client B and any other source-workspace work still assigned to Ivan.
4. Reassign that remaining work or explicitly approve limited handover access.
5. Execute the approved client and membership changes without recreating identities.
6. Verify destination access and denial of unrelated source-workspace records.
7. Preserve original partner/PIC attribution and finalized source reports.

## Open Decisions Before Implementation

- Does cross-workspace oversight include full client files, progress summaries,
  financial information, exports, or some combination?
- Who can grant cross-workspace access, approve transfers and revoke memberships?
- Should transferred client history include all completed cases/documents, and
  which source roles retain access to that transferred client's history?
- Do all active cases/compliance periods follow a client, or can selected work
  finish under the original partner? Define responsibility and access explicitly.
- Is temporary dual membership allowed for handover, with what expiry/revocation?
- What happens when a destination PIC is not a destination member? Reject, replace
  or explicitly leave unassigned according to the module's existing constraints.
- Can one client have simultaneous engagements under two partners? Recommended
  first version: one active managing workspace, without accidental duplication.
- Are transfers immediate only, or may they be scheduled/backdated? Recommended
  first version: immediate, audited transfers; no retrospective rewriting.
- Which announcements, branding/settings and reference rules are truly firm-wide?
- How should points/report attribution treat work spanning a transfer date?

## Current Priority: Verify Existing Features First

Before resuming this initiative, audit current behavior and document actual
results, expected behavior, defects and any missing implementations. Distinguish
production-backed features from demos/proposals; a preview is not proof of a live
workflow. Suggested verification areas:

- Login, registration/claim codes, staff roles, disabled accounts and recovery.
- Clients, active/inactive separation, imports, contract dates/sorting and editing.
- Allocation, filters, bulk PIC changes, No PIC, unsaved reset and yearly history.
- Cases, inline editing, dates, bulk clipboard, resizing, progress and permissions.
- My Work saves, linked cases, assignments, completion, monthly archive and layout.
- Monthly generation, correct PIC scope, NTPN, completion, claims and saved history.
- Annual Accounting/Tax generation, external clients, inline rows, controls,
  full-screen behavior, deletion/recovery, exports and live PIC synchronization.
- Management counts, portfolio totals, points and what reporting is actually live.
- Announcements, push notifications, links, user settings and persistence.
- Concurrent edits, failed saves, stale data, account switching and audit trails.
- Startup/refresh timing, full-screen loading and mobile navigation/layout.

No new workspace migration, production transfer or permission change should be
started merely because this plan has been saved. Resume only on a future explicit
request after reviewing readiness and the outstanding policy decisions.
