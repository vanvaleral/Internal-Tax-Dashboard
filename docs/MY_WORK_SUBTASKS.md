# My Work Subtask Editing

Subtask rows are not checkbox labels. Only the completion bullet toggles the
checkbox; clicking text focuses an inline title input without changing completion.
The checkbox and editor each have an accessible name and retain keyboard support.

Titles save on Enter or leaving the field through the existing version-checked
My Work save queue. Escape restores the last accepted local title without saving
the cancelled draft. Blank or over-1000-character titles are rejected; the user
can correct them or press Escape. Unchanged titles do not enqueue another save.
Completed subtasks remain editable; their strike-through is removed while focused.

Renaming changes only the title: stable subtask IDs, order, completion flags,
parent status and Case links are retained. Previously recorded Case timeline
events keep their original title snapshots; a rename is not another completion.
Failed saves use the existing retained-edit/retry/conflict behavior, never a fake
database confirmation. No dependency, authorization/API change or migration is
needed.

## New Subtask Drafts

The Add step composer keeps an in-memory draft per task. Input/blur and pre-render
capture protect text across forced redraws, background refreshes, other task saves,
drawer closing, task switches and viewport changes. The focused composer's caret
and selection are restored only for the same task, without repeatedly stealing
focus from other controls. Pending task creation IDs migrate their drafts to the
confirmed UUID before rendering the confirmed task.

The composer explicitly labels its text Draft (not saved). Enter validates a
1-1000-character trimmed title, adds exactly one unchecked step with a stable ID,
clears the composer draft and uses the existing save queue. IME composition does
not submit early. Escape discards only the current task's unsubmitted draft.
Blank/oversized drafts remain editable instead of disappearing. Submitted steps
remain visible with the existing Retry/conflict state if their save fails.

Draft text is intentionally excluded from task API payloads, browser storage and
history snapshots until Enter adds the step. A nonempty draft requests the browser's
standard before-unload warning; if the user chooses to reload/close anyway, these
memory-only drafts are lost. No task, Case history or points event is generated
merely by typing, switching tasks or restoring a draft. No migration is needed.
