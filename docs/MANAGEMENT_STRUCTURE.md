# Management Structure

Structure is a planning-only Management tab for Supervisors, Partners and legacy
Admins. Structure Lab displays each named scenario as an editable flowchart.
Drag an active PIC from the existing directory onto a manager or the top-level
drop zone. The card starts with the directory name and employment title (or the
access role when the title is absent). You can also click the name and then its
destination. Moving an existing card moves its whole branch. Cycles and
reporting lines deeper than six levels are rejected.

Each PIC already on the chart is hidden from that scenario's available roster.
Existing browser scenarios use the same saved data without a migration.
Add manual Partner, Team or Role cards for future positions. Removing a position
moves its direct reports to the removed position's parent.

Use the canvas zoom controls to zoom in or out, reset to 100%, or fit the
entire chart. Zooming does not change the saved scenario.
On desktop, the canvas and the PIC/editor sidebar share the same bottom edge.
The chart scrolls inside the canvas; narrower windows stack the panels.

**Conflicted Clients** compares each active Client Master record's current Tax
and Accounting PICs with the selected scenario. It flags a different nearest
Partner or a different leader at the level recorded in the client's Supervisor
field. A client's Supervisor can be a Leader or a Supervisor; a Supervisor
above a team Leader on the same branch is not itself a conflict. Client Master
does not store a separate team Leader field.

The check prefers staff IDs and uses exact, unique directory names for legacy
records without IDs. Missing owners, ambiguous names and incomplete scenario
branches appear under **Needs review**, not as confirmed conflicts. Inactive
clients, proposals and unassigned PIC fields are not checked. The review uses
already-loaded directory and Client Master data and never saves client changes.

Print scales the complete flowchart to the width and height available on one
landscape sheet, using the paper size selected in the browser print dialog.
Canvas zoom and scroll do not affect the result. With a large chart, choose a
larger paper size if the labels are too small. You can also save it as a PDF.
Editing controls and the PIC roster aren't printed.

Scenarios are saved only in the current browser, under the signed-in account's
storage key. They are not shared, backed up or stored in Supabase. Browser
storage is not an access-control boundary; use it on a trusted device and do
not enter confidential plans on a shared browser. No role, client assignment,
database record or partner workspace is created or changed.
