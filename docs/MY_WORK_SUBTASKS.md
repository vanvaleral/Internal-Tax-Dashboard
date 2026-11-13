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
