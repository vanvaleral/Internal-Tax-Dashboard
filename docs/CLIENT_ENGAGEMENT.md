# Contract And On Demand Clients

## Free Of Charge Extension / 10 November 2026

There are now three independent engagement categories, in addition to lifecycle
status (Active/Inactive):

| Category | Clients tab | Auto monthly generation | Paid portfolio / fees |
| --- | --- | --- | --- |
| Contract | Active Clients | Yes, for assigned PIC and obligations | Included |
| Free of Charge | Free of Charge | Yes, for assigned PIC and obligations | Excluded; new monthly snapshots use zero fees |
| On Demand | On Demand Clients | No | Excluded |

Free of Charge is NOT inactive and does not mean On Demand. Allocation retains
all operationally active categories and adds a Free of Charge filter. Profile's
assigned-client workload includes recurring FOC work with an explicit label/count;
the paid KPI/portfolio/growth and Contract Monitoring remain contract-only.
Annual server-side generation and Case linking keep their existing active-client
assignment rules. Existing monthly rows remain untouched regardless of category.

Leadership selects clients and chooses a destination category in the bulk-action
dropdown. This also allows moving clients mistakenly classified as On Demand into
Free of Charge, without changing IDs, obligations, PICs or previous work. Normal
staff cannot reclassify clients. Client saves/imports continue to omit the category
so an old sheet cannot silently reset it. No existing client moves automatically.

FOC classification does not erase stored Client Master fee/reference values or
contract dates. Its list and current fee preview show zero; Setup explicitly labels
the retained values as reference/history, not current charges. New monthly rows
snapshot FOC and zero fees, while historical monthly fee/payment snapshots are
preserved. Moving back to Contract restores visibility of retained master fee
values; review these before changing the engagement back.

Migration: `20261110072359_free_of_charge_clients.sql` widens the existing check
constraint and the audited service-only bulk function's allowed category values.
It uses a short lock timeout, retains invoker security/empty search path and
leadership validation, locks rows in ID order and rejects stale before-types
atomically. It performs no client-data update itself. Apply before deploying the
new code; the old app is not FOC-aware, so do not classify FOC clients until the
new renderer and monthly-generation API are both deployed. Do not roll back the
constraint after FOC data exists; retain the classification and history instead.

Checkbox selection updates the visible desktop/mobile checkboxes, select-all
indeterminate state, selection count and Move button in place. It does not rebuild
the Clients table, reset native vertical/horizontal scroll, discard expanded client
details, or replace the focused checkbox. Selecting clients remains UI-only; no
classification is written until the confirmed Move action succeeds. This behavior
applies to Contract, Free of Charge and On Demand lists without a schema change.

Client Setup saves show local Saving / Saved to database feedback inside the popup.
Inputs and close/save controls are disabled only during the pending save, preventing
duplicate requests or accidental dismissal. The editor stays open after confirmation
with a Done action, and ordinary background list refreshes do not replace its DOM.
Failures keep the form values for retry and leave confirmed Client Master values
unchanged. A later form edit clears the old success notice. No schema change is
needed for this feedback; API authorization and audited writes remain unchanged.

On desktop, Clients uses a viewport-height workspace: the global header, client
tabs, filters and selection controls retain their natural height; the native table
scrolls in the remaining space. Active, Free of Charge, On Demand, Inactive,
Proposal and Contract Monitoring share the same bounded register layout. The New
Client action has its own footer space instead of covering the last visible rows.
Contract commercial context stays visible in a compact row. Other menus retain
their normal layout, and mobile keeps its single natural page scroll. Extremely
short desktop viewports fall back to one page scrollbar with an uncapped table,
rather than clipping controls or creating another vertical table scrollbar. No
wheel listeners, scroll correction timers, virtualized rows or database changes
are introduced.

Tests: `client-engagement`, `client-free-of-charge`, `audit-operations-routes` and
the existing monthly persistence/client sorting tests. Hosted migration status
and validation results are recorded below after explicit approval and checks.

Hosted update applied with explicit approval to project `kedpcolyklquhfjzimvx`
as `20261110073545_free_of_charge_clients`. This corresponds to the local file
`20261110072359_free_of_charge_clients.sql`; do not reapply it because timestamps
differ. All 222 Client Master rows had identical pre/post content checksums;
the 670 existing activity rows were unchanged and no FOC client was created.
No-op, invalid-actor and stale-before-type database checks passed without changing
client records. Function execution remains denied to anon/authenticated and
allowed only for service_role. The application change still requires deployment;
no clients should be moved using an older renderer/API.

## Original On Demand Rollout

Clients now separates active Contract clients from active On Demand clients.
On Demand means annual/occasional work without a recurring contract; it is not an
inactive/archive state. Existing clients default to Contract. No client is moved
automatically, and contract dates/fees/PICs are never cleared by classification.

Leadership can select filtered rows (desktop and mobile) and move them to On
Demand, or select On Demand rows and move them back to Contract. Confirmation
explains monthly-generation implications. The UI changes only after the server
confirms the whole batch. A stale before-type fails atomically with a refresh
message. History is retained in client_master_activity; past monthly, annual,
Cases and yearly PIC records are not rewritten.

Active contract portfolio/PIC totals and Contract Monitoring exclude On Demand.
Automatic monthly generation considers active Contract and Free of Charge clients,
but excludes On Demand clients. Existing
monthly rows remain editable after a client moves. Annual generation still reads
active Client Master assignments, including On Demand clients, under the current
PIC rules. Cases can also select active On Demand records.

Allocation has an All engagements / Contract clients only / On Demand clients only
filter that composes with both PIC filters, search and changed-only. Both types
can retain their PICs; the engagement filter changes visibility, not ownership.
Clients defaults to newest contract date first, with unknown dates last; existing
explicitly saved sort preferences are respected. Dates are shown beneath names.

Apply `202611060002_client_engagement_type.sql` before deploying this app update.
It adds a non-null classification column with an instant Contract default and a
service-role-only audited bulk RPC. No operational data is deleted. Ordinary
client saves/imports omit the new column so an older browser or spreadsheet cannot
silently reset an existing On Demand client to Contract.

Rollback should retain the classification column and audit records. Restore prior
UI code only after considering whether monthly generation must still exclude On
Demand clients. Do not delete client rows to reverse this feature.

## Hosted Rollout / 6 November 2026

Applied to project `kedpcolyklquhfjzimvx` under hosted migration ledger version
`20261106050714_client_engagement_type`. This corresponds to the local migration
above; do not reapply it because the hosted timestamp differs.

All 222 existing Client Master records received the Contract default without
changing their status or other fields. Pre/post checksums matched for existing
client fields (excluding the new column), 18 Cases and 4 My Work tasks. No clients
were automatically moved to On Demand.

Rolled-back database tests verified forward/reverse moves, preservation of other
fields, an audit entry per change, stale-before-type rejection, whole-batch rollback
on conflict, and ordinary-staff rejection. Follow-up checks confirmed zero On
Demand clients and zero committed test engagement audit entries. The function is
security-invoker with an empty search path; only service_role can execute it.
No client data was exported. Application deployment is still required for the UI.

## Annual External Registration

New external Accounting/Tax Annual rows automatically register new On Demand
clients in the same database transaction as the work. The annual PIC stays on the
work row; Master PICs remain blank and can be assigned separately in Allocation.
Existing active matches are reused without reclassification. Ambiguous or inactive
matches require leadership review. Existing external history is not auto-backfilled.
See `ANNUAL_SHEET_INTEGRATION.md` for migration, atomicity and retry details.
