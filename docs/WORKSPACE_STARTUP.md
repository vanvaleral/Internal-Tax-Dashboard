# Workspace Startup

## Request Path

The root page is a data-free, static loader/iframe shell. It no longer performs
Supabase reads in both middleware and the Server Component. `/demo.html` and
annual HTML remain protected by the existing verified-user/active-staff middleware.
An unauthenticated iframe redirect is promoted to a top-level login/onboarding
navigation, rather than leaving the shell loader covering a login form.

Immediately after the dashboard's first-paint loader markup, `workspace-startup.js`
starts `GET /api/workspace/bootstrap`. It runs while the rest of the dashboard
is parsed. This replaces the blocking `/api/profile` request followed by multiple
independently authenticated initial API requests.

The exact bootstrap GET bypasses middleware authentication because its handler
calls `currentActor(request)` once: verified Auth user, fresh active staff profile,
and optional account-binding check. Its shared readers receive that actor only
within the current request. No user, role, permission or response is cached
server-side. Existing write APIs retain all authentication and ownership checks.
Root POSTs and path lookalikes do not receive the bypass.

The bootstrap reads Client Master and the active staff directory, plus the chosen
view's dependencies, concurrently. My Work loads Cases and Tasks; Cases loads its
own records; Monthly loads its control state; Client Detail loads related tasks,
cases and operational summaries; Management loads Cases and operational summaries.
Annual loads only the
selected team's sheet, using the same reader as `/api/annual-sheet?part=sheet`.
Client Master is explicitly paginated when it exceeds 500 rows. My Work retains
ownership/assignment scoping and pagination, fetches independent ownership and
assignment queries in parallel, and batches preference reads.

Ordinary APIs and bootstrap share read implementations for PIC scoping, fee
redaction, historical Monthly ownership and Annual permissions. Saves, generated
records, audit history and compare-and-swap behavior are not changed.

## Browser Lifetime And First Paint

The browser stores only a three-field, non-sensitive navigation hint under
`tax-dashboard-startup-view-v1`: menu, Monthly/Annual mode and Annual team.
It grants no access. A stale hint after an account change can cause an extra
authorized read for the actual account-scoped menu, never adoption of another
account's cached business records. Mobile startup hints normalize to supported
menus; Cases Full Screen does not overwrite the dashboard hint.

Confirmed startup packets are held in document memory, bound to the verified user,
consumed once and expire after 30 seconds. They are cleared on readiness. They
are never put in local storage, sent across tabs, or used to authorize writes.
The existing profile/API loading path remains a safe fallback if the optional
startup transport script is unavailable.

Partial required-read failures return no bootstrap packets. The loader stays
visible with Retry; authentication failures also offer Sign in again. It never
reveals sample rows or uses an old editable data snapshot as a successful load.
Initial reads do not repeatedly rebuild the selected view. Annual startup hands
its confirmed snapshot to the registered same-origin sheet using the existing
account-bound preload mechanism; the dashboard cover stays until sheet readiness.
There is no minimum animation duration, second global loader or exit animation.

## Background Work

Optional startup reads are functions queued only after the first menu is usable,
not promises started while building the queue. The queue runs during idle time,
with a deferred fallback and at most two jobs, or one on mobile/low-memory devices.
It pauses while the document is hidden and cancels waiting work on page exit.
Data Saver and 2G connections skip speculative reads; opening a menu still loads
its required records on demand. Optional health/performance reads use the same
queue. Entire Annual workspaces are no longer fetched behind unrelated menus.
The existing low-priority, single-team Annual preload runs after that queue.

## Measurement And Verification

Bootstrap responses have `Cache-Control: private, no-store, max-age=0`, `Vary:
Cookie`, and `Server-Timing` entries for authentication, each selected reader, and
total server work. Reader timings overlap because reads are concurrent; do not
add them to estimate total elapsed time.

After readiness, `window.__workspaceStartupTiming` contains numeric request/ready
durations and server timings, without record content or credentials. The top
dashboard frame records `readyMs` from its own navigation time origin, including
the iframe navigation gap. The child reports its own navigation-relative timing.
`workspace:ready` is also a browser Performance mark. Annual readiness includes
its sheet initialization, not just its data response. The fallback script path
does not emit the new metrics.

For deployed comparison, record at least five cold/browser-cache-disabled visits
and five ordinary refreshes for desktop and a real mobile device, using the same
account and starting menu. Compare medians and slowest samples, not one request.
Check Network Server-Timing and the top-frame ready metric. Do not export HAR
files with cookies or authorization headers. If network/platform startup dominates
after this change, verify Vercel execution region against the database region
before considering a hosting change. No region or plan change is assumed here.

Automated coverage exercises delayed/failed startup, desktop/mobile menu startup,
no sample flash, Annual handoff/readiness, account rejection, staff fee visibility,
historical ownership, pagination and bounded background jobs. Local tests do not
prove a deployed under-six-second result; that requires post-deployment measurement.

No schema migration, dependency, cron or production database change is required.
Rollback is an application deployment rollback; no records need reverting.
