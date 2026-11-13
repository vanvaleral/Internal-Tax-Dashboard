# Client Bulk Edit

Clients > Bulk Edit is a live, leadership-only editor for existing Active/Inactive
Client Master records. It does not create clients or convert proposals/contracts.
The tab is desktop-only; other client menus retain their existing layouts.

## Interaction

- Details, Fees & Dates and Obligations share one pending edit buffer. Dates use
  dd/mm/yyyy and fee editors use Indonesian thousand separators on blur. Boolean
  cells are checkboxes. No cell edit makes a save request.
  Monthly-fee edits do not silently recalculate annual fees; edit the annual fee
  explicitly when both amounts should change.
- Search (Enter/leave field), status, engagement category, Tax PIC and ACC PIC
  filters combine. Code/name/form sorting and 100-row pages keep large masters
  bounded. Selection is independent of dirty rows, persists across pages/groups
  and resets when filters change. Select page uses the displayed rows, even if an
  edited name would change its later sort position.
  PIC labels resolve through current staff-directory IDs/names without rewriting
  old master labels; legacy capitalization does not create separate PIC filters.
- Apply to selected stages one value for selected rows, not a database write.
  Mass names/NPWPs are deliberately unavailable; edit those cells individually.
  IDs/codes, PICs, statuses and engagement categories are not editable here. Use
  Allocation or the existing lifecycle/category actions for those changes.
- Review Changes asks the server to normalize and validate the entire batch and
  shows saved/new values. The editor behind the review is inert. Save Changes is
  a separate explicit action. Only server-confirmed success clears drafts.
- A failed/stale save keeps drafts. Discard & reload explicitly confirms removal
  of unsaved edits and reloads current saved records. Navigation between menus
  retains same-account drafts in document memory, with a page-close warning.
  Nothing is copied into local/session storage. Account switches clear drafts,
  and generation guards ignore late reads/saves from the previous account.
- The editor loads records only when opened. Clean reopens refresh saved data;
  pending edits retain their original baseline for conflict checking. It adds no startup database query.
  Offline demo use is explicitly read-only/unavailable, not a fake save path.

## Server And Audit

The private `/api/clients/bulk-edit` handler verifies the active account and
leadership role. Existing Clients feature middleware remains in place. An explicit
field allowlist rejects PIC/status/category/ID injection, invalid dates, negative
or unsafe amounts, invalid NPWP/booleans, duplicate IDs and oversized batches.
Only changed fields are sent; omitted fields, fees, obligations and history stay
unchanged. Up to 500 existing clients may be updated per transaction.

GET reads a minimal field projection in stable paginated order. POST checks IDs
and baseline timestamps, then resolves exact identities through the existing
matcher. A missing/reassigned/stale identity blocks the entire save, not just its
row. Review never writes. Final save reuses `commit_matched_client_import`, whose
table lock and expected-match comparison guard the actual transaction. It cannot
turn a missing client into a newly created record after review.

The existing `client_master_activity` keeps before/after audit records. The legacy
batch-history table records this with the explicit label
`Clients / Bulk Edit (no uploaded file)`. This reuses the audited batch mechanism;
it does not upload a file, change its schema or add a second save implementation.
No creation announcements, points, allocation histories or old case snapshots
are generated/rewritten. No database migration or new dependency is required.
