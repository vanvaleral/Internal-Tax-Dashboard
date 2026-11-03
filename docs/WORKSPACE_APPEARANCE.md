# Workspace Appearance

## Default And Personal Choices

The default palette is **Annual Green**, matching the annual control sheet:
sage canvas `#f0f2ee`, white surfaces, teal accent `#087f8d`, light teal selection
`#e7f4f3`, green-gray borders and slate text. The dashboard, login and first-paint
loaders share that default without adding an asset request or animation delay.
Layouts, mobile navigation, workflow status colors and checklist distinctions are
not redesigned. My Work and primary navigation/actions follow the chosen accent.

Settings retains Light/Dark, color presets, custom color and My Work image upload.
Existing valid saved choices are preserved, including the previous blue accent;
users are not silently forced to replace their personal settings. **Restore Annual
Green** selects Light + the default teal while retaining an uploaded background.
Primary-button text switches between dark and white according to accent luminance.

This uses the existing account-scoped browser preference mechanism. It does not
add a database preference table or claim cross-device synchronization. No migration
or business-record update is needed.

## Annual Sheets

The dashboard includes validated theme/color values in newly created annual iframe
URLs and sends cosmetic-only updates to existing frames. The sheet accepts those
messages only from its same-origin parent while embedded. Theme changes update
CSS variables and full-screen links; they do not rerender rows, replace an editor,
change the selected PIC/actor or perform a save/request.

Full-screen and team-switch links retain the validated Light/Dark and accent
parameters. An already-open standalone tab keeps its own appearance snapshot;
this implementation does not broadcast personal settings between separate tabs.
Invalid theme/color values are ignored or fall back to Annual Green. Uploaded
background data and operational data are never included in appearance messages or
URLs. Theme values are never used for authentication or authorization.

Accounting monthly-control colors and Tax milestone colors remain distinct.
Dark-mode surfaces/checklist contrast are provided without changing their data or
completion rules. The annual preload uses the same frames and is unaffected by
cosmetic changes; no speculative data cache is created by a theme update.

## Compact Desktop Navigation

At viewport widths of 901-1100px (for example, a half-screen desktop window), the
dashboard uses an 84px sticky left rail with custom SVG icons and readable labels.
This replaces the old single-column layout that placed the complete sidebar above
the workspace. User/points/attendance cards are hidden only in this width range;
attendance remains available through the existing header action. Short windows
can scroll the rail independently, without pushing the workspace below it.

All desktop menus remain available according to the existing role permissions.
This is not the restricted mobile feature set. Desktop navigation above 1100px
keeps its full sidebar when open; the fixed five-item mobile bottom navigation
at 900px and below remains unchanged. Cases Full Screen hides navigation entirely. Resizing is
CSS-only: it does not reload data, recreate Annual frames or change permissions.
No database migration or additional dependency is required.

Every desktop width above 900px has a small chevron handle at the sidebar's right
edge, including maximized windows. Hide it to slide the sidebar off the left and
widen the existing workspace; the same handle remains
at the left edge to reopen it. Hidden navigation is inert and excluded from
keyboard/screen-reader interaction. The button exposes its expanded state, and
reduced-motion settings disable the slide transition. Workspace DOM, focused
editors, Annual frames and data are not replaced by the toggle.

The edge handle retains its vertical centering on hover and press instead of
inheriting the generic button lift. Hide/show uses a 240ms slide with a short fade,
matching handle movement and chevron rotation. The sidebar keeps its normal width
during the transition and becomes visually hidden only after the slide completes.
The workspace grid resizes once, not on every animation frame, to avoid repeatedly
resizing embedded sheets. Reduced-motion preference disables all three transitions.

When hidden, the workspace also removes its usual 1780px width cap and fills the
available window with small edge margins. Attendance is available in the header
while its sidebar card is hidden. Reopening restores the original desktop layout.

The hide/show choice lives only in page memory and applies across desktop widths.
Resizing to mobile restores bottom navigation and removes inert/hidden state;
returning to desktop reapplies that page's choice. Reload starts with navigation open.
Cases Full Screen has no rail toggle. No local-storage preference or database write
is introduced.

Rail and mobile navigation share one minimal SVG icon family: a 24px canvas,
1.75px rounded strokes, open outlines and theme-inherited color. Calendar, folder,
checklist, people, chart, reassignment arrows, bell and profile silhouettes replace
the former mixed-detail symbols. Labels remain visible, button dimensions and
role rules are unchanged, and no icon font or external image request is added.
