# Illustrated Office Studio

## Purpose

`/office/studio` is a small playable art-direction demo linked from `/office`. It reuses the existing authenticated route boundary. It is separate from the shared office and makes no database writes or schema changes.

The user's approved concept guides the dense furnished environment, warm lighting, expressive character, and dark side panel. This implementation uses 2D raster layers, not a live 3D scene. The background workstations are scenic illustrations; one foreground desk and one character are interactive. The view is fixed.

## Assets

Built-in image generation created the following original PNG assets. They are committed to `public/office-art/` and served by the website:

- `studio-room-v2.png`: environment plate based on the approved office concept.
- `character-poses-v2.png`: three equal-width sprite cells: standing, lifted, seated with chair. Transparent alpha is retained.
- `studio-desk-v1.png`: separate foreground desk with computer and accessories, transparent alpha.

The layout layers the seated sprite behind the desk and the lifted sprite above it. CSS supplies breathing, lift sway, landing bounce, focus motion, ground shadow and destination marker. These are three illustrated poses plus procedural motion, not frame-by-frame skeletal animation. Animations respect reduced-motion preferences.

## Controls

Drag Arif, release over open foreground floor or the interactive desk, then use Start working / Stand controls. Desk click is an alternative. Keyboard: focus character; arrows move; Enter/Space sit or stand; Escape cancels a drag. Pointer cancellation/window blur also restores the prior position. A reset button starts the demo again. Optional synthesized sound is opt-in and uses no external audio library.

Loading includes cached-image checks and a visible failure/reload state. Movement stays in component state and resets when the page reloads. The dark guide panel reports real demo progress and does not show fabricated online users or chat messages. Links lead to the existing shared office for actual chat and voice.

## Integration and rollback

No dependencies or Supabase migration are required. Delete `app/office/studio`, `components/office/office-studio.tsx`, `components/office/office-studio.css`, the three asset files, and the studio link in `virtual-office.tsx` to remove this experiment.

## Acceptance checks

Check desktop/mobile composition, all three image loads, character drag/drop, invalid drop return, desk seating, working/rest transitions, standing, reset, keyboard controls and reduced motion. The proof scene should be approved before expanding interactions to the whole illustrated office.
