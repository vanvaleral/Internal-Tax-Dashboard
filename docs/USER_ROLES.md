# USER ROLES

## Current State

The current repository does not implement a complete real role/permission system.

Observed reality:
- demo UI carries role-like behavior in client-side state
- middleware initializes Supabase but does not enforce route access
- no server-side authorization policies are implemented
- no RLS policy definitions are present in `supabase/schema.sql`

## Required Role Direction

At minimum the system should support:
- Admin
- Partner
- Supervisor
- Team Leader
- Staff

## Recommended Role Responsibilities

### Admin
- manage users
- manage configuration
- manage role assignments
- manage workflow templates
- manage tax types, case types, deadline rules, teams, and statuses

### Partner
- firm-wide visibility
- high-risk case visibility
- management reporting access
- risk oversight

### Supervisor
- monitor multiple staff/teams
- view exceptions
- review and approve work
- intervene on overdue and blocked items

### Team Leader
- operational oversight within team scope
- assignment balancing
- escalation awareness
- review participation where applicable

### Staff
- manage assigned recurring work
- manage assigned cases
- update next actions
- submit work for review

## Current Gap

The present UI concept assumes scoped visibility, but the backend does not enforce it.

This is one of the first high-risk gaps to resolve before large-scale feature implementation.

## Authorization Principles

- permissions must be server-side
- UI hiding is not enough
- row-level policies should be considered for Supabase
- sensitive operations must be validated against role and ownership

## Recommended Near-Term Plan

### First
- define canonical role model
- decide whether roles live in Supabase auth metadata, `staff_profiles`, or both

### Second
- map ownership fields:
  - partner
  - supervisor
  - team leader
  - tax PIC
  - accounting PIC

### Third
- implement route and data-level protection

### Fourth
- align demo visibility behavior with real server-side rules
