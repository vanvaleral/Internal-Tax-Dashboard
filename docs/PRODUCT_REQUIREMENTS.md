# PRODUCT REQUIREMENTS

## Product Position

This application is an internal Indonesian Tax Practice Management System for a tax consulting firm.

It should evolve from a strong operational demo into a durable internal system that supports:
- client control
- recurring monthly tax compliance
- annual compliance
- tax case management
- tasks / next actions
- review and approval
- workload visibility
- risk and exception management

## Current System Reality

The current repository already contains a good UX prototype and a narrow recurring-compliance schema.

The system should evolve from that base, not be rebuilt from zero.

## Product Principles

- Staff manage actions.
- The system manages deadlines.
- Supervisors manage exceptions.
- Partners manage risk.

The system must not degrade into a sophisticated to-do list.

## Primary Modules

### 1. Clients
The authoritative source of operational identity and tax applicability.

### 2. Recurring Tax Compliance
Monthly/periodic obligation control derived from client tax profile and rules.

### 3. Annual Compliance
Separate annual control sheets/workflows for:
- Accounting Team
- Tax Team

### 4. Tax Cases
Non-recurring matters such as SP2DK, audits, objections, restitutions, registrations, and advisory work.

### 5. Tasks / Next Actions
Operational work items generated from recurring obligations and cases.

### 6. Review & Approval
Preparation, review, revision, and approval control.

### 7. Management / Reporting
Exception dashboard, workload visibility, progress tracking, and risk oversight.

## Client Master Requirements

Each client should support at minimum:
- Client code / ID
- Legal name
- NPWP
- status
- industry
- engagement start
- engagement end
- partner
- supervisor
- team
- accounting PIC
- tax PIC
- service package
- notes

Each client also needs a tax profile that defines which obligations apply.

## Recurring Compliance Requirements

Recurring compliance should:
- generate obligations automatically based on client tax profile and period
- track internal and statutory deadlines
- track current workflow stage
- track next action and next action owner
- support blockers
- support payment and filing states
- support reviewer assignment where relevant

## Monthly Tax Control Requirements

Management needs a fast exception table showing:
- overall client/period state
- obligation state by tax type
- overdue work
- waiting client
- waiting payment
- awaiting review
- upcoming deadlines

## Annual Compliance Requirements

Annual compliance remains separate from monthly recurring work.

### Annual Accounting
Optimized for accounting-led annual close/finalization progression.

### Annual Tax
Optimized for annual tax return preparation, confirmation, payment, reporting, and NTPE visibility.

## Case Management Requirements

Tax cases require:
- case identity
- case type
- client
- PIC / reviewer / supervisor / partner
- internal and external deadlines
- stage/workflow
- next action
- blocker
- risk
- resolution and closing history

## Task / Next Action Requirements

Tasks may belong to:
- recurring obligations
- annual compliance items
- tax cases

They should support assignment, due dates, priority, status, blockers, and completion tracking.

## Review & Approval Requirements

The system should support:
- prepared
- submitted for review
- revision required
- approved
- completed

History must be retained.

## Audit Requirements

Important actions must generate protected or immutable historical records.

## Notification Requirements

In-app notification support should prioritize exceptions and overdue work.

## UX Requirements

- preserve the good current visual direction
- optimize for operational scanning
- reduce clicks
- support filtering/sorting/search
- keep recurring work dense and fast
- avoid modal-heavy bureaucracy

## Non-Goals for Immediate Phase

The immediate next step is not full implementation.

The immediate next step is:
- document
- align architecture
- close critical integrity/security gaps first
