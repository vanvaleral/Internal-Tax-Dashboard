# Virtual Office v1

The dashboard links to `/office`. The page uses the existing Supabase session and active-staff check. Its data is reached through authenticated Next.js API routes and stored in separate `virtual_office_*` tables. No tax case, client, or performance ledger rows are changed by the office.

## Deployment

Apply `20260928054249_virtual_office.sql` before deploying the app. Apply `20260928054318_virtual_office_game.sql` if the mini game will be enabled. The Vercel project uses its existing Supabase URL, publishable/anon key, and server-only service role key. The office needs no new secret.

The mini game defaults to enabled. Set `VIRTUAL_OFFICE_GAME_ENABLED=false` in Vercel and redeploy to hide it and reject its API requests. The office room, avatar settings, and chat keep working because they use different components, routes, and tables. To remove the mini game permanently, delete `components/office/office-game.tsx`, `app/api/office/game/route.ts`, the `<OfficeGame />` usage, and its CSS rules. The `virtual_office_game` table can be retained as harmless history or removed in a later reviewed migration. Its removal does not require changes to the tax or office data model.

## Current scope

- Avatar movement is displayed to other visitors through five-second polling; a visitor is shown online for 45 seconds after their last update.
- Each visitor can choose an avatar color and one decoration for their desk.
- Chat contains the most recent 40 messages and allows 280 characters per message, with a short send cooldown.
- The shared mini game counts 12 filing moves per round. It does not award performance points.

The office is a first iteration, not a replacement for tax workflows. If future upgrades use earned points, only verified work events should determine that entitlement, through server-side logic.
