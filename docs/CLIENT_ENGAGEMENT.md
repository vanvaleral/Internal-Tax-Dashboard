# Contract And On Demand Clients

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
Automatic monthly generation only considers active Contract clients. Existing
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
