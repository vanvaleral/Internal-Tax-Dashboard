# My Work Personal Task Order

Hold the body/title of a task for three seconds, then drag vertically. A thin
progress line shows the hold; only after the full hold does the task lift.
Completion bullets, stars, inputs and other interactive controls never start a
drag. Releasing early behaves as a normal click; moving before the hold finishes
cancels the gesture so normal touch scrolling stays available.

The lifted task retains its original styling. Other visible task rows dim, a
same-height gap marks the destination, and surrounding rows animate into place.
The list scrolls when dragging near its top/bottom edge. It does not run a
continuous layout loop while the pointer is stationary away from the edges.
Drop completes the move without opening the task drawer. Escape, pointer/touch
cancellation, window blur, resizing, navigation and rerender restore the original
position and clear the dimming. Reduced-motion users get the same interaction
without animated displacement/lift. Focused rows also support Alt+Up/Down with
screen-reader announcements, without requiring a timed pointer gesture.

## Scope And Persistence

- Ordering is a personal display preference, saved in the existing authenticated
  account/browser UI storage (`myWorkOrder`), like column widths. It survives
  refresh/navigation on this browser; it is not cross-device database sync.
- Active tasks and each completed month are independent groups. Dragging never
  changes completion, archive dates, assignees, task contents, Cases or points.
  Completed-month ordering remains available after that month becomes archived.
  Searching an archive preserves hidden rows while reordering only visible rows.
- Before manual ordering, existing favorites-first/current and date-based
  completed ordering are unchanged. A manual order takes precedence within its
  section; favorite flags remain available and unchanged. Tasks without an
  existing manual position appear before the manually ordered entries.
- Only task IDs are added to UI preferences. Task writes continue through the
  existing version-checked API/save queue. Reordering makes no task/database call
  and therefore cannot generate a completion or Case timeline event.
- Pending creation IDs are remapped to confirmed task UUIDs after a successful
  creation. Cancelled/no-op drags do not save an ordering preference.
- No dependency, database migration, RLS change or shared-task API change is
  required. `public/my-work-reorder.js` and CSS are data-free UI assets.
