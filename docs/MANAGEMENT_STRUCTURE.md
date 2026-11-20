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

**Team Split** is a planning comparison for two separate branches in the
selected chart. If the scenario has exactly two non-nested leader cards, they
are preselected; management can select other branch roots. Active clients
get a suggested team when their Current Tax and Accounting PICs are in the
same branch, or when their only assigned PIC maps to one branch. Confirm
suggestions or set individual intended teams. Cross-team, unmapped, and
unassigned clients do not receive automatic suggestions.

Compare **Current PICs** or **Next PICs** to show differences from the confirmed
intended team. Next reads the current browser's unsaved Allocation drafts,
retains the current PIC for a role without a draft, and honors explicit
unassignment. The preview also shows split assignments and whole-team moves
when an intended team has not been confirmed. Confirmations store only
client IDs and chart branch IDs in the browser scenario. Changing branch
roots requires confirmation if intended teams are already saved.

**Recommend PIC changes** keeps in-team PICs and blank roles unchanged. For
each assigned PIC known to be outside the confirmed team, it chooses the
eligible Tax or Accounting PIC in that team with the fewest assigned clients
for the selected Current/Next comparison, then counts the suggested move
before choosing the next replacement. It excludes partners, ambiguous
directory names, and PICs outside the team. Missing team confirmations,
unmapped PICs, and teams without an eligible replacement need manual review.
These are suggestions only, not changes to Allocation drafts or Client Master.

This does not create a second workspace or update Client Master, permissions,
or Allocation. A future shared Supabase plan should store proposed team
memberships and confirmed client ownership separately from operational
assignments, behind the existing Management permissions.

Print scales the complete flowchart to the width and height available on one
landscape sheet, using the paper size selected in the browser print dialog.
Canvas zoom and scroll do not affect the result. With a large chart, choose a
larger paper size if the labels are too small. You can also save it as a PDF.
Editing controls and the PIC roster aren't printed.

The same **Print** button works from either tab. When both Team Split branches
are selected and client data is available, it puts the flowchart first and
lists the flagged active clients on subsequent pages. Otherwise it prints only
the flowchart. The report compares saved
Current PICs against the selected branches and confirmed intended teams; it
includes all flagged rows regardless of the on-screen filter. It does not
include Next PIC drafts or modify any assignments.

Scenarios are saved only in the current browser, under the signed-in account's
storage key. They are not shared, backed up or stored in Supabase. Browser
storage is not an access-control boundary; use it on a trusted device and do
not enter confidential plans on a shared browser. No role, client assignment,
database record or partner workspace is created or changed.
