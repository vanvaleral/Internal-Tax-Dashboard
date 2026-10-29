# Allocation: No PIC

Allocation offers an explicit No PIC option in both the Accounting and Tax PIC
dropdowns, on desktop and mobile. This is a manual choice; an Individual client
is not automatically unassigned. For an individual who needs only Tax services,
choose No PIC under Next ACC PIC and leave Next TAX PIC unchanged.

An empty draft string means remove the PIC, not keep the current PIC. Unspecified
draft fields still retain their existing assignment. Pending counts, Changed
only, sorting, the request payload, failure retries and printed reports follow
the same distinction. Current values and reports label empty assignments No PIC.
The PIC filters can also show clients with no current Accounting or Tax PIC.

Only leadership can apply an allocation batch; server authorization is unchanged.
The API requires both destination PIC fields explicitly to avoid clearing an
omitted field accidentally. Empty strings or explicit nulls become null profile
IDs and names. Nonempty names must still resolve to one active staff profile;
unknown or ambiguous names reject the entire batch before writing.

No migration or data rewrite is required. The existing
apply_client_pic_allocation_batch function accepts null assignments, updates
Client Master and inserts the yearly before/after history and activity record in
one transaction. Existing monthly snapshots, cases and annual work ownership are
not reassigned by this change. No PIC is a display label, not a fictitious staff
profile and is never stored as the PIC name.

## Entry Order

The Allocation order dropdown offers Company form / name (the existing default),
Oldest added first, and Newest added first. Column headers still sort other
fields; the dropdown shows Column sort for those explicit sorts. The choice uses
the existing account-scoped browser preferences and remains independent of PIC
filters and pending allocation drafts.

Date-added sorting uses Client Master's existing created_at timestamp, not
updated_at, the contract date or the allocation year. PIC changes and ordinary
client edits therefore do not change entry order. Clients created at the same
timestamp (including some bulk imports) use client code as a deterministic
numeric tie-breaker; the original Excel row order cannot be inferred from a
shared timestamp alone. Rows with missing/invalid creation dates appear after
known dates in both directions. No dates are synthesized, and no migration is
needed. The No. column continues to number the displayed, filtered rows.

## Bulk Selection And Reset

Row checkboxes select clients on desktop and mobile. Select all selects only
currently visible rows. Selections follow client IDs through sorting; rows
hidden by a filter or no longer active are removed from selection. The header
checkbox shows mixed state for partial selection. Selection itself is temporary
and is not stored in the database or browser preferences.

Selecting rows reveals Assign ACC PIC and Assign Tax PIC dropdowns. Choosing a
PIC (or No PIC) stages that field for the selected visible clients only; the
other field, including an existing unsaved choice, remains untouched. These
actions make no database requests. Clear selection leaves drafts intact.
There is intentionally no PIC clipboard-paste feature.

Reset unsaved confirms before discarding every allocation draft, including
filtered-out clients, and clears selection. It also removes the discarded
allocation-save error. Saved Client Master assignments and allocation history,
the previous successful report, allocation year, sort and filters are retained.
Discarded drafts are removed from browser preferences so refresh cannot restore
them. This is not a database rollback.
Browser history entries from before reset or successful Apply cannot resurrect
discarded/applied drafts. Normal navigation between still-pending edits remains
supported.

Apply PIC Update still saves all pending drafts, not only selected rows, through
the existing leadership-only audited batch endpoint. During Apply, per-row and
bulk editing, selection, reset, duplicate submission and year changes are locked.
The submitted year is captured before the request and reused in its report.
Closing/reloading during an Apply request triggers the unsaved-work warning.
Success clears drafts and selection; failure unlocks editing and retains drafts
for retry or explicit reset. No schema migration or authorization change is
required.
