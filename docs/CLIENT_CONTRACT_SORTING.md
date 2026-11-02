# Client Contract Sorting

Clients > Active Clients and Inactive Clients share a desktop/mobile order
dropdown beside the PIC and search filters. Contract: oldest first and Contract:
newest first sort by Client Master's Contract Start date, not when the row was
imported, last edited, signed, or reassigned to a PIC.

Historical clients without Contract Start fall back to their recorded Engagement
Start. Missing or invalid dates always appear last, in either direction. Equal
dates use client name, numeric client code and ID as deterministic tie-breakers.
Live rows without either date remain blank; no placeholder date is synthesized.

The existing company-form/name default, sortable table headers, PIC/search filters,
visible row numbering and inactive archive separation are retained. The reverse
arrow also reverses contract ordering. Sort preferences use the existing
account-scoped browser UI settings and do not update business records.

No API change, database migration or data rewrite is needed.
