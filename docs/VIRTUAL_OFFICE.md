# Virtual Office

The dashboard links to `/office`, using the existing Supabase session and active-staff checks. Office components, API routes and `virtual_office_*` tables are separate from tax cases, clients and performance points.

## Deployment

Apply migrations `20260928054249_virtual_office.sql`, `20260928054318_virtual_office_game.sql`, and `20260928071448_virtual_office_layout_voice.sql` before deploying this revision. Keep the existing Supabase environment variables. The layout revision is additive and retains old grid columns.

## Room and interactions

The room is a flat overhead illustration with shaded furniture, based on the supplied office plan. The numbers in the sketch are interpreted as seat counts: A=2, B=3, C=3, D=3, E=2, F=2, G=1, H=1, plus a partner seat.

Drag your avatar to lift it, then release on open floor or a chair. Invalid drops return to the previous location. Dropping near a chair snaps to that seat. Alternatively select a desk and choose a chair; arrow keys move a focused avatar. A seated character can start/finish working or stand up. Working is a social presence status and does not record billable time or award points.

The server validates coordinates and controls seat ownership. A unique database index prevents simultaneous claims. Seats are released after 45 seconds without a heartbeat. Presence refreshes every four seconds; movement is synchronized after the drop. Avatar colors and personal decoration are saved.

Chat remains inside the office, with 40 recent messages, 280 characters per message, and temporary speech bubbles. The filing mini game remains available through the toolbar and contributes only to its own shared round.

## Voice meeting

Open Meeting suara, select Ruang kerja or Ruang partner, and explicitly join. Browser microphone permission is required. The microphone starts muted; the user can unmute or leave. Leaving, closing the page, or losing the session closes local tracks and peer connections. Switching to chat preserves the meeting.

WebRTC carries audio between participants. Authenticated API routes exchange bounded SDP/ICE messages using ephemeral Supabase tables. Sessions are bound to the active staff member and signals are limited to participants in the same channel. Both channels are available to all active staff; the partner channel is not an access-controlled private room. No audio recording is implemented. Expired signaling is deleted on the next join.

This first implementation uses peer-to-peer mesh for small meetings. For reliable connections across restrictive networks, configure a TURN relay in Vercel using server environment variable `OFFICE_VOICE_ICE_SERVERS`, a JSON array such as:

```json
[{"urls":"stun:stun.l.google.com:19302"},{"urls":["turn:YOUR_HOST:3478","turns:YOUR_HOST:5349"],"username":"YOUR_USERNAME","credential":"YOUR_CREDENTIAL"}]
```

Without this variable, the app uses STUN only, which cannot connect every network combination. Obtain credentials from your TURN provider; do not commit real credentials. ICE credentials are necessarily returned to authenticated meeting participants, so use dedicated restricted relay credentials and rotate them. Larger meetings should use an SFU service. Two-device live audio still needs acceptance testing on the team's actual networks.

## Feature removal

`VIRTUAL_OFFICE_VOICE_ENABLED=false` hides voice and rejects new voice requests; redeploy after changing it. `VIRTUAL_OFFICE_GAME_ENABLED=false` independently disables the mini game. Office chat and desks continue working.

To remove the office entirely, remove the dashboard `/office` link, `app/office`, `app/api/office`, `components/office`, and the `lib/office-*` modules. Retain the separate tables as history or remove them in a reviewed migration. No tax workflow depends on these tables.

## Verification

`node --experimental-strip-types --test tests/office-layout-voice.test.ts tests/office-voice-route.test.ts` checks layout geometry, seat capacities, signal validation, ICE configuration, staff authorization, session ownership and room boundaries. TypeScript and a local browser fixture check rendering and desk controls. The fixture does not establish a real two-device voice call.

## Illustrated art-direction demo

Visit `/office/studio` via **Coba studio 2D** for the separate one-character, one-desk illustrated demo. See `OFFICE_STUDIO.md` for scope, assets, controls and removal instructions. No additional database migration is needed.
