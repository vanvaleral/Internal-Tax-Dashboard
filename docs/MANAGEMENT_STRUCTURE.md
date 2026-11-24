# Management Structure

Structure is a planning-only Management tab for Supervisors, Partners and legacy
Admins. Structure Lab displays one editable flowchart, **Team Dewa Structure**.
Drag an active PIC from the existing directory onto a manager or the top-level
drop zone. The card starts with the directory name and employment title (or the
access role when the title is absent). You can also click the name and then its
destination. Moving an existing card moves its whole branch. Cycles and
reporting lines deeper than six levels are rejected.

Each PIC already on the chart is hidden from the available roster.
The last active chart is used automatically. Older plans are retained in the
browser, but the scenario controls are no longer shown. No migration is required.
Add manual Partner, Team or Role cards for future positions. Removing a position
moves its direct reports to the removed position's parent.

Use the canvas zoom controls to zoom in or out, reset to 100%, or fit the
entire chart. Zooming does not change the saved chart.
On desktop, the canvas and the PIC/editor sidebar share the same bottom edge.
The chart scrolls inside the canvas; narrower windows stack the panels.

**Team Split** compares Teams A and B plus an optional Team C for the incoming
partner. If the chart has exactly two non-nested leader cards, they are
preselected as A and B. Select the current supervisor's card for Team C.
It may sit above A and B: each PIC maps to the closest selected team, so
Team C does not absorb the PICs already mapped to A or B. Active clients
get a suggested team when their Current Tax and Accounting PICs are in the
same branch, or when their only assigned PIC maps to one branch. Confirm
suggestions or set individual intended teams. Cross-team, unmapped, and
unassigned clients do not receive automatic suggestions.

The **team client load** at the top of Structure follows the Current/Next
selector, as does the Team Split table. Use **Show summary** / **Hide summary**
to collapse the panel without changing what is included when printing.
Each active client counts once per
team, even if both roles are assigned to that team. A shared client counts
once in each involved team. Clients without a PIC mapped to any selected
team are shown separately. Each team also shows how many flagged clients
it is involved in, including its confirmed clients assigned elsewhere.
A split is uneven if the busiest and lightest teams' shares differ by more
than 20 percentage points (equivalent to 60/40 for two teams). This measures
volume, not case complexity or staffing.

Compare **Current PICs** or **Next PICs** to show differences from the confirmed
intended team. Next reads the current browser's unsaved Allocation drafts,
retains the current PIC for a role without a draft, and honors explicit
unassignment. The preview also shows split assignments and whole-team moves
when an intended team has not been confirmed. Confirmations store only
client IDs and chart branch IDs in the browser. Changing branch
roots A or B requires confirmation if intended teams are already saved.
Adding Team C preserves existing confirmations; replacing or clearing Team C
only clears ownership confirmations for that branch, with a prompt.

Click a Team Split column header to search its values and choose which ones to
show. Selections within one column are alternatives; filters across columns
and the **Show** selector combine. **Select all shown** changes only the
choices matching the search. **Clear column filters** resets the table without
changing **Show**. These filters do not change totals, saved teams, or reports.

**Recommend PIC changes** keeps in-team PICs and blank roles unchanged. For
each assigned PIC known to be outside the confirmed team, it chooses the
eligible Tax or Accounting PIC in that team with the fewest assigned clients
for the selected Current/Next comparison, then counts the suggested move
before choosing the next replacement. It excludes partners (including the
incoming Team C partner), ambiguous
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

The same **Print** button works from either tab. When Teams A and B
are selected and client data is available, the first page shows the client
load summary above the flowchart and subsequent pages list the flagged active
clients. Otherwise it prints only the flowchart. The report uses the selected
mode, labels Next PIC reports as draft forecasts, and includes all flagged
rows regardless of the on-screen filter. It does not modify any assignments.

Charts are saved only in the current browser, under the signed-in account's
storage key. They are not shared, backed up or stored in Supabase. Browser
storage is not an access-control boundary; use it on a trusted device and do
not enter confidential plans on a shared browser. No role, client assignment,
database record or partner workspace is created or changed.
