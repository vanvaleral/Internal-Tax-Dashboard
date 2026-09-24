# DATABASE SCHEMA

## Current Schema Summary

Current SQL objects in `supabase/schema.sql`:

### Enums
- `team_division`
- `client_status`
- `compliance_status`
- `submission_type`
- `tax_type`

### Tables
- `staff_profiles`
- `clients`
- `client_tax_profiles`
- `tax_periods`
- `compliance_tasks`

### Functions
- `ensure_tax_period(date)`
- `generate_monthly_compliance_tasks(date)`
- `adjust_follow_up_count(uuid, integer)`

### View
- `compliance_board`

## Current Schema Strengths

- Supports basic recurring monthly task generation.
- Enforces uniqueness for generated recurring tasks.
- Has a simple staff/client/profile/task structure.

## Current Schema Limitations

### Client table too small
Current `clients` table only stores:
- `name`
- `assigned_pic_id`
- `team_division`
- `status`
- timestamps

It does not yet support the broader client-master role required by the product.

### Single-PIC assumption
The schema assumes only one assigned PIC, while current product direction already requires:
- Tax PIC
- Accounting PIC

### Tax profile too narrow
`client_tax_profiles` currently couples:
- `tax_type`
- `due_day`
- `obligation_name`

This is enough for simple recurring generation, but not for a richer configurable obligation taxonomy.

### No case tables
No persistence exists for non-recurring tax cases.

### No annual compliance tables
No persistence exists for:
- annual accounting control
- annual tax return control

### No task engine
`compliance_tasks` is a recurring compliance record, not a universal task/next-action table.

### My Work task sharing
Migration `202609120004_my_work_tasks.sql` introduces a lightweight shared task model:
- `my_work_tasks` keeps the original creator, content, completion timestamps, reminders, and repeat rules.
- `my_work_task_assignees` adds additional PICs without changing original ownership.
- `my_work_task_preferences` stores each user's favorite ordering separately.

Completing a repeating task creates the next instance server-side. This preserves the creator and assignee relationship even when the original creator's browser is closed.

### Leadership scope
Migration `202609130001_leader_role_access.sql` adds `leader` alongside `supervisor`, `partner`, and `admin` as leadership roles. These roles can view the full operational workload; staff remain restricted to clients where they are PIC TAX or PIC ACC.

### No review tables
No review, approval, or revision history entities exist.

### No audit/event log tables
No immutable historical activity model exists.

### No deadline rule tables
Internal vs statutory deadlines are not modeled separately in a configurable way.

### No document reference tables
No file/document linkage model exists.

## Recommended Target Evolution

## 1. Client foundation

Recommended core client model:
- `clients`
- `client_roles` or columns for partner/supervisor/team leader ownership
- `client_tax_profiles`
- `client_service_packages`
- `client_contacts` if needed later

Possible fields:
- client code
- legal name
- NPWP
- industry
- status
- engagement dates
- partner
- supervisor
- team
- accounting PIC
- tax PIC
- notes

## 2. Configurable tax obligations

Recommended additions:
- `tax_obligation_types`
- optional `deadline_rules`
- optional `workflow_templates`

This avoids scattering hard-coded tax categories and due logic.

## 3. Recurring compliance engine

Recommended tables:
- `recurring_obligations`
- `recurring_obligation_periods` or `compliance_items`
- `recurring_reviews`
- `recurring_activity_logs`

Each obligation item should store:
- client
- obligation type
- tax period
- internal deadline
- statutory deadline
- stage
- next action
- owner
- blocker
- payment state
- filing state

## 4. Annual compliance

Recommended separate models:
- `annual_accounting_controls`
- `annual_tax_controls`

or one parent annual record with subtype tables if carefully normalized.

Do not force them into the same schema object as recurring monthly tasks.

## 5. Case management

Recommended tables:
- `case_types`
- `cases`
- `case_stages`
- `case_reviews`
- `case_activity_logs`

## 6. Task / next-action engine

Recommended generic table:
- `tasks`

with polymorphic or explicit parent linkage to:
- recurring compliance
- annual controls
- cases

## 7. Review / approval

Recommended tables:
- `reviews`
- `review_comments`
- `review_decisions`

or per-domain review tables with a shared pattern.

## 8. Audit trail

Recommended generic event model:
- `activity_logs`

Suggested fields:
- id
- entity_type
- entity_id
- action
- previous_value_json
- new_value_json
- actor_user_id
- created_at

## 9. Notifications / escalations

Recommended later tables:
- `notification_rules`
- `notifications`
- `escalation_events`

## Recommended Database Priority

### Phase 1
- strengthen client master
- add dual PIC support
- add roles/ownership support
- prepare RLS-friendly structure

### Phase 2
- add case schema

### Phase 3
- refactor recurring compliance schema toward configurable workflows/deadlines

### Phase 4+
- add task/review/audit/notification layers

## Migration Strategy Notes

- Preserve current recurring task data if any real records already exist.
- Add new columns/tables rather than rewriting `compliance_tasks` destructively.
- Treat the current schema as a seed prototype, not as final domain design.

## Proposal and Contract Pipeline

Proposal, contract, and active-client stages retain one `client_master` row so conversion does not duplicate the client identity. The `status` progression is `Proposal` -> `Contract` -> `Active`; contract legal fields remain nullable while the record is a proposal and are validated by the application before activation. Migration `202609240001_proposal_contract_workflow.sql` adds the legal-party, notary, deed, and signing fields without rewriting existing client records.
