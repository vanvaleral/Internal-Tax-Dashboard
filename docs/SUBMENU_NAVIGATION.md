# Submenu Presentation

`public/submenu-tabs.css` provides one segmented-tab appearance for Operations,
Cases, Clients, Management, Profile, My Work, and annual Accounting/Tax sheets.
It is loaded after their existing presentation styles, including standalone
annual and Cases full-screen views. Existing button attributes and event handlers
remain unchanged; no routes, permissions, records or database migrations change.

Primary groups use the Cases design: a compact bordered tray, muted inactive
labels, and a filled accent-colored selected tab. Existing counts are badges;
no new counts are inferred from operational data.

Nested groups carry `submenu-secondary`: smaller, lighter segments with an
accent-tinted selection. Operations' category and queue/team rows are separated
by a subtle divider. PIC Access status, contract filters, annual workflow/status
tabs, and annual integration previews use this quieter level.

The shared stylesheet uses existing dashboard/annual theme tokens for custom
accents, contrast, and dark mode. On narrow screens long tab groups scroll within
their own container; Cases retains its existing two-button mobile layout.
Keyboard focus remains visible and action buttons outside navigation groups
are unaffected.
Selected tabs retain their background/text colors under hover and press. Only
inactive tabs receive a pale hover highlight; navigation tabs do not inherit
the generic button lift, brightness filter, or background-color transition.

Only the exact non-data CSS asset `/submenu-tabs.css` is added to the public UI
asset allowlist. HTML and APIs retain their existing authorization requirements.
Annual idle preloading warms this stylesheet along with existing sheet assets.
