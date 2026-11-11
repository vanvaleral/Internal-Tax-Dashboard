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

## Day-First Entry And Display

Contract Start and Engagement End use explicit `dd/mm/yyyy` text fields with a
separate calendar button, rather than letting the browser's regional settings
choose a potentially month-first native date display. For example, `03/04/2026`
means 3 April and saves as `2026-04-03`. Valid ISO dates pasted from another system
are also accepted and displayed day-first. Numeric mobile keyboards may enter
eight day-first digits (for example `15092026`), normalized on leaving/saving the
field without rewriting every keystroke. Calendar picks target their own field,
including in the popup where legacy hidden form IDs are duplicated.

Both fields use strict calendar validation shared with Cases. Impossible dates,
month-first-only strings, and invalid leap dates block the save and retain the
typed value for correction. Clearing an optional date stays blank. Sorting,
API payloads, exports and PostgreSQL dates continue to use ISO `yyyy-mm-dd`.
Existing stored dates are not automatically swapped, reinterpreted or rewritten;
previously mis-entered ambiguous dates must be reviewed explicitly.
