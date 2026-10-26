# Annual Accounting Summary Preview

The standalone accounting sheet and the opt-in dashboard preview use one Summary
view. Annual Tax retains its separate subject/milestone views and completion rules.

Team overview starts collapsed, with a cyan-tinted header and an explicit Show
overview toggle. Expanding retains the PIC filtering and whole-year summaries.

- Admin teknis, Data, and Penyusunan display segmented month bars at rest. Clicking
  a bar reveals a native 0-12 month slider; leaving it restores the segments without
  changing the saved value. An in-progress drag stays active until release. F2 or
  Space opens the keyboard editor, which stays open until Escape, Enter, or focus
  moves away. Dragging previews a count; release commits one undoable change.
  Keyboard, paste, and formula entry
  accept the same integer counts. Editing a bar fills January through the selected
  month, replacing any non-contiguous month selection for that control only.
- Payment value is optional and non-negative. An unknown amount is blank, distinct
  from an explicitly recorded zero.
- Saving a nonblank NTPE marks the row Done and moves it into Complete. It does not
  mark unfinished monthly controls as checked. Clearing NTPE restores the stage
  recorded before automatic completion. Reopening via Progress requires clearing
  NTPE first. Undo restores the entire previous row.
- Row ownership/assistant permissions apply to sliders, payment, and NTPE through
  every demo editing path. PIC assignments remain leadership-only.
- Excel export retains all selected-year rows and monthly detail for backup,
  including payment value and NTPE in both worksheets.

This is sample-only interaction code: no storage, API requests, or database changes.
No migration is required for this preview. Production integration must persist the
payment, receipt, and previous-stage fields with server-side authorization and
audit events before these rules can be treated as authoritative.

The same renderer now also has an explicit authenticated `live=1` mode, used by the
production dashboard. Its transport, persistence and migration requirements are
documented in `ANNUAL_SHEET_INTEGRATION.md`; the default/file-based demo remains
sample-only.
