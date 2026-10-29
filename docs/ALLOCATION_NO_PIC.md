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
