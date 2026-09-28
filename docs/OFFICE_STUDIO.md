# Illustrated Office Studio

## Purpose

`/office/studio` is a playable 2D art-direction demo linked from `/office`. It reuses the existing authenticated route boundary. It is separate from the shared office and makes no database writes or schema changes.

The user's approved concept guides the furnished environment, warm lighting, expressive character, and dark side panel. The camera stays fixed. All 11 marked chairs across seven illustrated desk groups are interactive, including the partner room. Their coordinates are maintained in `lib/office-studio-map.ts`.

## Assets and layering

Built-in image generation created these project PNG assets:

- `studio-room-v2.png`: environment with all desks, furniture, and the partner room.
- `character-poses-v2.png`: three transparent sprite cells for standing, lifted, and seated poses.

The separate foreground desk was removed. The seated sprite is clipped at most desks so its lower half appears behind the illustrated worktop. CSS supplies breathing, lift sway, landing bounce, focus motion, walking bob, ground shadow, and destination marker. These are three illustrated poses plus procedural motion. Reduced-motion preferences are respected.

## Controls

Drag Arif and release near a marked chair to sit, or on an open aisle to move. Click a chair or choose a desk from the list. Click open floor to walk there; walking routes pass through corridors and avoid furniture. Start working / Rest / Stand controls use the current seat. Keyboard: focus Arif; arrows move, Enter/Space sit at the selected desk or stand, Escape cancels a drag. Pointer cancellation/window blur restores the prior position. Reset starts again. Optional synthesized sound is opt-in and uses no external audio library.

Loading includes cached-image checks and a visible failure/reload state. Movement stays in component state and resets on page reload. The guide panel reports actual demo progress and does not show fabricated online users or chat messages. Links lead to the existing shared office for actual chat and voice.

## Integration and rollback

No dependencies or Supabase migration are required. Remove `app/office/studio`, `components/office/office-studio.tsx`, `components/office/office-studio.css`, `lib/office-studio-map.ts`, the two studio assets, and the studio link in `virtual-office.tsx` to remove the experiment.

## Verification

`node --experimental-strip-types --test tests/office-studio-map.test.ts` checks all chair destinations, blocked furniture, and walking routes from each desk. Browser acceptance covers desktop/mobile composition, chair selection, floor movement, drag/drop, invalid drop, work/rest/stand, keyboard, and asset loading. The room illustration is static; only Arif is an interactive character in this demo.
