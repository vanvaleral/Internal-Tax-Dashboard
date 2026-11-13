# App Installation And Icons

The existing Heritage/Growth Diamond SVG remains the source of truth. Installation
artwork is generated deterministically, not redrawn or replaced with another logo.
Run `node scripts/generate-app-icons.cjs` after an intentional source SVG change.
The generator uses sharp already installed with Next.js, without a new dependency.
Generated PNG/ICO files are checked in, so deployment does not depend on running
an image generation task or an external image service.

The manifest has a stable root app ID, a protected /dashboard start URL, standalone
display and the existing Annual Green theme. It declares separate 192/512 PNG app
icons and an opaque, padded maskable icon. The maskable artwork stays within the
central safe circle. An Apple touch icon and 16/32/48 Windows ICO fallback supplement
the SVG browser-tab favicon. Root Next metadata, the live dashboard renderer and
the shared annual-sheet document link the same manifest and icons.

Only these exact branding asset paths bypass authentication for GET/HEAD. Private
HTML, operational APIs, lookalike paths and uploads remain protected. The manifest
contains no staff/client information. Installing is not offline mode: no fetch
cache, client-data snapshot, login bypass or demo fallback is added. Login and
all server-side authorization remain required; the existing push worker is retained.

After deployment, Chrome may retain artwork from an older shortcut installation.
If it does not update, remove/reinstall the app shortcut without choosing to clear
site data. Do not erase browser storage as an icon repair step: it can contain
unsaved task edits and account-specific UI preferences. Installing from the main
dashboard is recommended; all supported linked pages share the same app identity.
