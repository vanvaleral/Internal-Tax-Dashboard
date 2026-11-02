# Tax Dashboard: Manual Feature Acceptance Checklist

Created: 2026-10-30. All checks start unverified. This is a user testing guide,
not a claim that the deployed website has passed these checks.

Purpose: identify what works, is slow, is missing, or behaves incorrectly before
starting the deferred partner-workspace initiative.

## How To Use

Test one menu at a time. Reply with the check ID and what happened; screenshots
or short screen recordings are helpful but not required. Mask client identifiers,
NPWP, private documents and personal information before sharing images.

Use these result labels:

| Result | Meaning |
| --- | --- |
| OK | Works as expected, including after refresh when saving is involved. |
| SLOW | Works, but takes too long. Include approximate seconds. |
| BUG | Exists, but gives the wrong result or fails. |
| MISSING | Required functionality is absent. Describe the behavior you need. |
| NOT TESTED | Not checked yet. |
| NOT DEPLOYED | Exists locally or in a newer build, but not in the tested version. |
| PLANNED | Intentionally a preview/deferred feature, not yet a live workflow. |
| N/A | Does not apply to this account, device or workflow; explain briefly. |

Example report:

```text
Version/URL: production website; tested on 30 October 2026
Device/browser: Windows / Chrome
Account role: Staff (no password needed)

MW-02 | SLOW | New task takes about 3 seconds to confirm saved.
CL-02 | BUG | Edit button opens nothing for the second row.
MO-04 | BUG | NTPN disappears after leaving the cell and refreshing.
CAS-03 | OK
```

For a bug, add the shortest steps to repeat it and whether refresh fixes it.
For a saving issue, say whether another browser shows the change. Never send
passwords, claim codes, service-role keys, VAPID private keys or session cookies.

## Safe Test Setup And Version Notes

- Use the deployed HTTPS application, not a file-based demo, when checking saving
  and database behavior. Record the tested URL/version and date.
- Use an approved test client/task/case and test staff account for modifications.
  Label test records clearly. Do not alter real fees, identifiers or assignments
  just to test a field.
- Test bulk imports/generation, permanent deletion, access removal and retention
  jobs in staging or with explicitly approved test data. Do not delete live work,
  archive a real employee, trigger purge jobs or change the computer date.
- Reopening and ordinary refresh are useful checks. Do not clear browser storage
  while edits are pending; first confirm whether they reached the database.
- At checklist creation, contract-date sorting has passed local tests but has not
  been pushed/deployed. Mark CL-06 NOT DEPLOYED if testing the older website.
- Management > Monthly Report currently contains illustrative report data and a
  disabled finalization action marked backend pending. Record this as PLANNED,
  not as a newly discovered broken live finalization feature.
- Partner workspaces/transfers and the proposed pending-points/milestone approval
  model are deferred plans, not current acceptance criteria.
- Some older project documents describe prototypes. Use current visible behavior,
  current code and the deployed version when resolving discrepancies.

## Suggested Testing Order

1. Startup and navigation, then My Work saving and completion.
2. Clients, Allocation and Cases.
3. Monthly Compliance and Tax Claims.
4. Annual Accounting and Annual Tax.
5. Management, Profile, Alerts/Settings and mobile layout.
6. Permissions, cross-browser persistence, concurrent edits and recovery.

## Startup And Navigation

- [ ] **ST-01** Open the website from a fresh visit and record seconds until the first menu is usable.
- [ ] **ST-02** Refresh the page and record the same time separately from the first visit.
- [ ] **ST-03** The loader appears promptly and stays until real first-menu data is ready; no sample/demo records flash.
- [ ] **ST-04** Loading does not add a second blocking screen after the first loader disappears; failed loading offers a usable retry/sign-in path.
- [ ] **ST-05** Every main menu and submenu renders on the first click, without leaving and returning to force an update.
- [ ] **ST-06** Browser Back/Forward and refresh keep a sensible menu without changing the account or resurrecting discarded changes.
- [ ] **ST-07** Switching away from Annual hides its sheet; it never remains underneath Cases or another menu.
- [ ] **ST-08** Record menu-opening times for Allocation, Cases, My Work and each Annual team, including full-screen tabs.

The desired first-load target discussed is under six seconds. Record actual
results rather than treating that target as an already-proven guarantee.

## Login And Access

- [ ] **AU-01** Normal login/logout works; failed login gives a clear message and does not expose application data.
- [ ] **AU-02** A staff account sees its permitted work; compare with a supervisor account without assuming both should see identical records.
- [ ] **AU-03** Staff cannot perform leadership-only edits, reassignments, imports, access management or other restricted actions through old links.
- [ ] **AU-04** Staff cannot see restricted client fees or obtain them through an export/print route that should be restricted.
- [ ] **AU-05** Switching accounts in the browser never displays the previous account's private rows, drafts or permissions.
- [ ] **AU-06** Registration/claim-code setup, invalid codes and Regenerate Claim Code behave correctly using approved test accounts only.
- [ ] **AU-07** A disabled test account loses access, including from an already-open tab; test only in an approved environment.

Current leadership access is still for the existing single practice. Future
partner-to-partner isolation must not be assumed to exist yet.

## Clients

- [ ] **CL-01** Active Clients contains only active records; Inactive Clients retains archived records separately.
- [ ] **CL-02** Edit opens the correct client's form, saves the intended fields, and survives refresh/reopening.
- [ ] **CL-03** Creating a test client validates required information and gives it a unique identity/code.
- [ ] **CL-04** Search and PIC filtering work together without showing unrelated clients.
- [ ] **CL-05** Numbering, company form separation and ascending/descending column sorting remain correct after filtering.
- [ ] **CL-06** Contract: oldest/newest sorting works; recorded legacy Engagement Start is used when needed and unknown dates stay last. Check deployment status first.
- [ ] **CL-07** Expanding a client shows the right obligation checklist; permitted changes persist and restricted accounts cannot change it.
- [ ] **CL-08** Inactivating/reactivating an approved test client updates its lists without deleting history or corrupting active totals.
- [ ] **CL-09** Client Operational Overview shows the selected client's actual information and linked work, not another client's details.
- [ ] **CL-10** Import preview identifies invalid/duplicate rows and intentional updates correctly; commit only an approved test file.
- [ ] **CL-11** Imported blank PICs stay unassigned rather than receiving an arbitrary employee; exported rows match the permitted data and documented export scope.

## Proposals And Contracts

- [ ] **PC-01** Proposal entry requests the agreed proposal fields without forcing optional NPWP/address or later contract details prematurely.
- [ ] **PC-02** Annual fee calculates as monthly fee x 12 x 30%, and an intentional manual override can be saved.
- [ ] **PC-03** Convert to Contract carries proposal information forward and validates the additional contract fields.
- [ ] **PC-04** Contract start month/year, obligations and optional Tax/Accounting PIC assignments save correctly.
- [ ] **PC-05** Convert to Active is available at the appropriate signed-contract stage and does not duplicate the client or count it early as active.

## Allocation

- [ ] **AL-01** ACC PIC and Tax PIC filters work simultaneously with search and Changed only.
- [ ] **AL-02** Company-form/name and oldest/newest-added ordering work without confusing entry date with contract date.
- [ ] **AL-03** Changing either PIC marks the correct row Pending Update; changing it back removes a real pending change.
- [ ] **AL-04** No PIC is an explicit option and remains blank after Apply and refresh; changing the other PIC does not undo it.
- [ ] **AL-05** Select multiple/select all assigns only the intended visible clients; sorting/filtering does not switch selected identities.
- [ ] **AL-06** Reset unsaved discards drafts only after confirmation; saved assignments remain unchanged and Back/refresh do not restore discarded drafts.
- [ ] **AL-07** Apply saves the intended pending batch once, handles errors clearly, and retains failed drafts for retry rather than pretending success.
- [ ] **AL-08** Allocation year, before/after PIC history and latest batch report are accurate; older completed work retains its historical PIC.

## Cases: Himbauan And Pemeriksaan

- [ ] **CAS-01** Both tabs display their own cases and correct counts; filters/search do not mix categories.
- [ ] **CAS-02** Adding a case links the intended Client Master record and validates required information/PIC access.
- [ ] **CAS-03** Inline values save after editing and remain correct after refresh; empty or invalid values are handled clearly.
- [ ] **CAS-04** Date cells show DD/MM/YYYY; typing, calendar selection and pasting day-first dates store the intended day/month.
- [ ] **CAS-05** Deadline/due-date behavior matches the agreed case rules and changes only when its relevant inputs change.
- [ ] **CAS-06** Cell-range selection and bulk copy/paste preserve rows, dates and values; invalid/unauthorized changes do not silently overwrite data.
- [ ] **CAS-07** Row numbers reflect the agreed creation-order behavior while column sorting/filtering changes the display order.
- [ ] **CAS-08** Column resizing persists and the expanded progress panel fits the visible area without unnecessary horizontal scrolling.
- [ ] **CAS-09** Expanding a saved case shows the correct progress and completed linked My Work tasks; a new unsaved case explains its next step clearly.
- [ ] **CAS-10** Only authorized leadership can change case PICs through the inline dropdowns; changes persist without an extra reassignment button.
- [ ] **CAS-11** Full Screen opens the intended case sheet and account, with correct filters/data and usable saving.
- [ ] **CAS-12** Archive/delete/restore behavior preserves required links and history; verify using test records only.

## My Work

- [ ] **MW-01** Create a task and verify its title, identity and ownership remain correct after refresh.
- [ ] **MW-02** Edit a task and record seconds until the database confirms saving; a visible edit alone is not proof it saved.
- [ ] **MW-03** Complete a task: it leaves the active section, appears under Completed, and updates the count correctly.
- [ ] **MW-04** Completed expands/collapses, and reopening a task returns it to the correct active state without duplication.
- [ ] **MW-05** Linked to selects the intended case directly; completion appears under that case's progress.
- [ ] **MW-06** Assign to, favorites and any visible due/reminder controls save and affect the intended task only.
- [ ] **MW-07** Archived organizes older completed tasks by the intended month/year and supports finding an older task without scrolling every month.
- [ ] **MW-08** Closing the detail pane restores the full task list; choosing another task opens the correct details.
- [ ] **MW-09** Mobile-to-desktop resizing does not leave panes incorrectly minimized, stretched or hidden.
- [ ] **MW-10** Rapid typing, task switching and refresh do not duplicate tasks, lose edits or attach changes to the wrong task.

The desired save target discussed is under one second. Record confirmation time
and cross-browser persistence separately; an optimistic UI update is not a durable save.

## Operations: Monthly Compliance

- [ ] **MO-01** Generate Month opens a usable preview of eligible clients and intended PIC before creating records.
- [ ] **MO-02** Normal Tax PIC generation is correctly scoped; authorized leadership can generate on behalf of the intended PIC.
- [ ] **MO-03** Generating the same month again does not create duplicate client rows; review approved test data only.
- [ ] **MO-04** Client rows expand/collapse correctly, including after editing and when entering/leaving Edit Mode.
- [ ] **MO-05** Tax payable typing does not append zeroes or reformat the value incorrectly while typing/backspacing.
- [ ] **MO-06** NTPN and other payment/reporting fields persist after leaving the cell, switching menus and refreshing.
- [ ] **MO-07** Completion follows the agreed obligation/data/payment rules and does not require an unused billing-PDF upload.
- [ ] **MO-08** Completed History, Claim Status and Reporting Archive show the right periods and historical PICs after later Allocation changes.
- [ ] **MO-09** Edit Mode selection/delete affects only permitted test rows and gives the explicit permanent-delete warning. Do not test on real work.
- [ ] **MO-10** Monthly export produces a usable Excel file with the intended period, rows and values.

## Tax Claims

- [ ] **TC-01** Create Tax Claim opens the correct client/period without an undefined-function error; record ready-to-edit time.
- [ ] **TC-02** Tax items and payable amounts agree with the saved Monthly Compliance record used to create the claim.
- [ ] **TC-03** Claim identity, saved contents and subsequent reopening refer to the same intended claim, not a transient browser-only document.
- [ ] **TC-04** Editor changes save durably and reopen/print with the correct client, period, contact details and amounts.
- [ ] **TC-05** Printing/PDF uses A4, fits up to seven ordinary items as designed, and has clean breaks/margins if content exceeds one page.
- [ ] **TC-06** Claim list/status navigation and permitted access work across browsers; sample claims are not mistaken for saved production records.

## Annual Compliance: Accounting

- [ ] **AA-01** The intended tax year, team and status filters show the correct Accounting work, without creating duplicates on repeat generation.
- [ ] **AA-02** Generate Clients includes eligible active ACC assignments; Add Ext Client/inline new rows do not inflate Client Master allocation counts.
- [ ] **AA-03** New bottom rows can be edited and approved spreadsheet data pasted into them; invalid input is handled without corrupting adjacent rows.
- [ ] **AA-04** Cells/dropdowns, sorting, PIC filters and Reset work intuitively and preserve the right row identity.
- [ ] **AA-05** Admin Teknis, Data and Penyusunan bars/checklists edit the intended months and persist after refresh.
- [ ] **AA-06** Progress changes auto-fill the agreed control rows, and payment/NTPE completion follows the intended rules.
- [ ] **AA-07** Team Overview shows current permitted PICs, accurate remaining clients/completion percentages and functioning PIC-to-sheet filtering.
- [ ] **AA-08** Full Screen, team switching and returning to a tab do not unnecessarily lock editing or lose confirmed data; record loading time.
- [ ] **AA-09** Row-number deletion/recovery follows the intended archive policy and permissions; exported Excel includes the documented summary/year scope.

## Annual Compliance: Tax

- [ ] **AT-01** Generate Clients includes eligible active Individual taxpayers and does not invent director subjects from company names.
- [ ] **AT-02** Add Ext Client/inline rows preserve annual-only subject IDs, links and the distinction from Client Master allocations.
- [ ] **AT-03** Subject ownership, Tax/ACC PIC choices and allowed editing match the current staff directory and account permissions.
- [ ] **AT-04** Documents, Preparation and Filing & Payment milestone cells save correctly; completion respects required evidence.
- [ ] **AT-05** Year/status/PIC/search filters, sorting, Reset and Team Overview show consistent counts and progress.
- [ ] **AT-06** Full Screen, bulk paste, row deletion/recovery and Excel export work for Tax as well as Accounting, without mixing teams or years.

## Management

- [ ] **MG-01** KPI Overview, Client Growth, Portfolio Dashboard and Portfolio Snapshot agree on active-client totals; inactive clients are not counted as active.
- [ ] **MG-02** Per-PIC counts match actual active assignments, including blank PICs and normalized name casing; all applicable PICs appear.
- [ ] **MG-03** Completed/open work, monthly/annual progress, risk and fees can be reconciled to their source records rather than sample data.
- [ ] **MG-04** PIC Access creates/edits/restores approved test staff correctly and updates PIC choices in Clients, Cases and Annual sheets.
- [ ] **MG-05** Archived access appears separately with the expected 14-day retention information; scheduled purge requires controlled administrative verification, not a live-user deletion test.
- [ ] **MG-06** Recognition/points reconcile to the currently implemented earning/reversal rules, without assuming the proposed milestone/pending-points system is live.
- [ ] **MG-07** Quick Access links reach the intended menu/submenu, including after older saved navigation settings.
- [ ] **MG-08** Monthly Report is clearly labeled illustrative/preview; finalize is currently backend pending. Record live historical finalization as PLANNED unless a later verified implementation exists.

## Profile, Alerts And Settings

- [ ] **PF-01** Profile name/username and permitted settings save; the displayed account/role remains correct.
- [ ] **PF-02** Assigned-client count and Client List agree with active Client Master PIC assignments; numbering/search are correct.
- [ ] **PF-03** Announcement History and permitted delete/restore actions affect the correct account only.
- [ ] **NT-01** Authorized announcement creation reaches only intended recipients, with accurate unread/read counts.
- [ ] **NT-02** Alerts opening, closing, read status and links behave consistently; mobile uses its intended full-menu presentation.
- [ ] **NT-03** Push toggle requests permission only when chosen and shows understandable subscribed/blocked/unsupported states.
- [ ] **NT-04** An approved test push reaches the subscribed device and opens the right record/account; record delivery delay separately from inbox delay.
- [ ] **NT-05** Logging out or changing accounts does not expose a prior account's notification content or subscription controls.
- [ ] **SE-01** Theme/accent changes are readable and apply consistently across main menus and embedded annual sheets.
- [ ] **SE-02** My Work background upload/reset and appearance restoration behave as intended, without changing business data.
- [ ] **SE-03** Record which settings survive refresh and which synchronize between browsers; do not assume appearance preferences are cloud-synced.
- [ ] **SE-04** Attend gives the intended result, avoids accidental double submission and provides clear failure feedback.

## Mobile-Specific Checks

- [ ] **MB-01** The intended mobile menus (My Work, Cases, Clients, Alerts and Profile) are available; desktop-only tools do not overcrowd navigation.
- [ ] **MB-02** Bottom navigation appears immediately, stays visible while scrolling and is not covered by floating actions or large blank gaps.
- [ ] **MB-03** Header database status, Attend, Settings and Logout are spaced and centered; the duplicate header bell stays hidden on mobile.
- [ ] **MB-04** Client rows stay compact; the centered + button does not cover bottom navigation or important row actions.
- [ ] **MB-05** My Work initially uses the full list; selecting a task opens the intended detail view and Back/Close restores the list.
- [ ] **MB-06** The task composer does not jump while typing, opening the keyboard, scrolling or resizing; both panes fit the usable viewport.
- [ ] **MB-07** Touch controls, filters, menus, dialogs and close buttons are reachable without unintended page overflow or horizontal page scrolling.

## Persistence, Concurrent Use And Recovery

- [ ] **IN-01** Save an approved test change in one browser, then reopen/refresh the same permitted record in another browser; the database value agrees.
- [ ] **IN-02** Edit different test records from two sessions; neither user's saved changes replace unrelated work.
- [ ] **IN-03** Edit the same test field concurrently in controlled sessions; conflicts/retries are clear and do not silently lose another confirmed edit.
- [ ] **IN-04** On an approved test task, interrupt connectivity during save; failure/pending state is visible and retry does not create duplicates or falsely report success.
- [ ] **IN-05** Switching menus, opening a full-screen sheet or returning from a background tab does not let an old response overwrite a newer confirmed save.
- [ ] **IN-06** Archiving/restoring a test record preserves the intended case/task/claim references and original historical responsibility.
- [ ] **IN-07** Important test actions have traceable actor/time/history where the feature promises auditing; report missing audit coverage separately.

Do not mass-edit live records to simulate 16 users. If normal use exposes slow
concurrent saving, report examples; controlled load testing is a separate task.

## What To Send Back First

Prioritize data loss, incorrect access, wrong clients/PICs, wrong amounts and
failed saving over cosmetic issues. Then report loading/scrolling problems and
missing conveniences. A short list of IDs with observations is enough to start.

Do not mark a check OK solely because an automated test passed. These checks are
about actual behavior in your tested browser, account and deployed version.

Related future initiative: [Partner Workspaces Plan](PARTNER_WORKSPACES_PLAN.md).
