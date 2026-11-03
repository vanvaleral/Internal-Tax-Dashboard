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

## Desktop Navigation And Spacing

The dashboard uses a centered shell capped at 1920px rather than stretching across
ultrawide monitors. Wide desktop has 22px outer padding, a 22px sidebar/workspace
gap, and a roomier 260px sidebar with 18px internal padding. All workspace frames
share the available content width, so moving between menus stays consistent.

Desktop offers exactly two persistent sidebar sizes: Full (260px, with normal
labels and profile/points/attendance cards) and Mini (84px, with custom icons above
labels). Neither mode auto-hides or creates a hover popup. The chevron switches
sizes, exposes its full/mini state accessibly, and does not move vertically on
hover or press. Double-clicking the title/background also switches sizes;
interactive buttons and fields retain their normal behavior.

Wide desktop starts Full; 901-1100px windows start Mini to avoid stacking a large
sidebar above the workspace. Both sizes can be selected explicitly at either
desktop width. Narrow desktop retains 14px outer padding and an 18px workspace
gap. A selection remains in page memory across desktop resizes; reload restores
the width-based default. No local-storage or database preference is added.

Mini navigation is always usable, follows existing role-based menu visibility and
scrolls independently in short windows. Its hidden information cards are replaced
by the existing header Attend action. Navigation itself is never made inert.
Changing size does not recreate the workspace, editors or Annual frames, or
request/rewrite business data. Grid width changes once; only the edge handle and
chevron animate, with reduced-motion support.

Mobile at 900px and below retains its fixed five-item bottom navigation and
existing feature restrictions, without a desktop size toggle. Cases Full Screen
still hides dashboard navigation entirely. No hover zones, cloned menu trees,
popup timers, pointer-position tracking or auto-close behavior remain.

Rail and mobile navigation share the same minimal 24px SVG family with 1.75px
rounded strokes and theme-inherited color. Calendar, folder, checklist, people,
chart, reassignment arrows, bell and profile icons retain readable labels. No
icon font, external request, new dependency or database migration is required.
