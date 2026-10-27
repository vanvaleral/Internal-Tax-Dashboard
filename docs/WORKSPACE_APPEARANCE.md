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
