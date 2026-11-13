# Notifications

## Current Demo Behavior

The prototype in `public/demo.html` provides:

- a per-user Notification Center with unread counts
- a Management broadcast composer for briefing, meeting, and firm-wide notices
- a Wall of Fame announcement after Employee of the Month is finalized
- local browser persistence for demo review

The desktop header action is labeled **Notification** and opens **Notification
Center**. The popup closes with Close, Escape, the header toggle, or a click on
the transparent outside backdrop. The backdrop covers embedded sheets as well,
so an outside click dismisses the popup without also editing the sheet underneath.
Clicks within the panel do not dismiss it; notification read actions and History
keep their existing behavior. Mobile retains its full-page notification view,
also titled Notification Center. These are UI-only changes; database/API names,
delivery, recipients and stored history are unchanged.

Announcements are stored in Supabase with per-recipient read status. Web Push is
implemented separately for opted-in devices and requires the configured VAPID
keys, HTTPS and browser permission; it is not the source of truth for the inbox.

## My Work Reminders And Push Checks (13 November 2026)

The previous My Work implementation stored `reminder_at` but never processed due
reminders. The datetime picker also sent timezone-less text, and task responses
discarded the saved UTC offset. Quick choices and manually picked times could
therefore disagree. Production diagnostics found one overdue reminder without
reminder delivery, one registered push device and six past accepted push deliveries.
No current failed push jobs were found; this does not establish device/OS display.

New reminder writes use explicit UTC instants; the picker and card display local
browser time. Old timezone-less writes are rejected with a refresh instruction.
Existing stored reminder dates are not guessed/reinterpreted or rewritten. Users
can remove a reminder, or set a new future time. Quick choices always pick the
next future 20:00 or tomorrow 09:00 in browser-local time. Reminder links open the
authorized My Work task rather than the remembered last menu.

The additive database functions create one reminder event per task/time, lock due
tasks, and atomically write the announcement, recipients and push outbox. Only the
active registered creator/assignees with permitted My Work and Notifications access
are targeted, not every leader. In-app delivery does not require a push subscription.
Task completion, Case timelines, points and task versions are not changed.
Completed/rescheduled reminders have their remaining delivery jobs cancelled.

`20261113024124_my_work_reminders_and_push_delivery.sql` adds the server-only event
and scheduler-state tables, an unfinished-reminder index, atomic delivery leases,
and self-test rate limiting. Existing task/subscription fields are preserved.
`20261113024528_notification_minute_scheduler.sql` enables pg_cron/pg_net, generates
a random scheduler token in Vault and installs a **paused** minute-level job.
The token never appears in source code, cron commands or API responses.

### Deployment And Activation

Apply the migrations before deploying the matching API/UI. Keep the minute job
paused until deployment is verified. Then explicitly activate with:

```sql
select public.set_notification_scheduler_enabled(true);
```

This sets the first activation cutoff: old overdue reminders are deliberately not
backfilled. When recovering from an interruption, at most the last 24 hours of
otherwise eligible reminders are considered. The job checks once a minute and
invokes the website worker only while delivery jobs are due, not for idle ticks.
Each worker claims at most ten jobs with five-minute leases and uses at most three
concurrent deliveries. Push retries retain the same notification tag. Timing is
best effort, generally a minute or two, not an exact-second alarm.

To pause without removing history:

```sql
select public.set_notification_scheduler_enabled(false);
```

Existing Vercel daily retries remain compatible via CRON_SECRET. The new scheduler
authenticates through a narrow service-only Vault-token verifier. It does not need
the VAPID private key or a Supabase service-role key in the cron command. Anonymous
and ordinary authenticated users cannot run scheduler/queue/test-claim functions.

### Device Checks

Settings checks both VAPID keys, their mathematical pairing and VAPID subject in
the **website server environment (Vercel)**. Supabase Edge Function secrets do not
configure these Next.js routes. It shows this device's subscription and actual
browser permission, not whether a different device is enabled. Permission is
requested only from the On click, before unrelated asynchronous work; subscribing
waits for service-worker activation. Off revokes only this device.

Settings > Notifications > Send test notification sends a user-initiated push to
the current account/device only, limited to once per 30 seconds. Expired 404/410
subscriptions are removed and can be re-enabled. Other errors show a sanitized
provider status rather than endpoint keys. Accepted by a provider does not prove
that Windows/browser displayed it; check site permission, OS notifications and
Do Not Disturb. Background push also depends on the browser/OS remaining capable
of receiving it, and cannot wake a powered-off computer.

Push clicks are same-origin and use the protected live renderer, never demo data.
The service worker uses an existing PNG icon and stable tags without re-alerting
for the same retry. No unrequested test push or historical notification is sent
during development/validation. Local tests use synthetic data and mocked providers.

### Hosted Preparation / 13 November 2026

Applied with explicit approval to `kedpcolyklquhfjzimvx`:

- `20261113030524_my_work_reminders_and_push_delivery` corresponds to local
  `20261113024124_my_work_reminders_and_push_delivery.sql`.
- `20261113030528_notification_minute_scheduler` corresponds to local
  `20261113024528_notification_minute_scheduler.sql`.

Do not reapply historical migrations with an unreconciled `supabase db push`.
The named cron job is inactive, settings are disabled and activation cutoff is
null. A real tick returned enabled=false without enqueueing work. No reminder
events, test pushes or historical announcements were created. All six existing
tasks had identical pre/post hashes; the existing subscription's original fields
also matched. Announcement/recipient/delivery counts were unchanged.

Anonymous enqueue and authenticated scheduler activation remain denied, server
claiming is permitted and an invalid scheduler token is rejected. Security
advisors gained only the expected two INFO entries for server-only RLS tables
with no browser policies; the pre-existing WARN findings are unchanged.
The isolated PostgreSQL fixture passed, as did 555 regression tests, the targeted
device/time tests, typecheck and production build. Test fixture stubs were updated
for the already-existing Cases viewport constant and compact/safe-area client
button markup; no unrelated production behavior was changed for those tests.

Application changes are not deployed by a database migration. Deploy the matching
code, verify the protected worker/new settings response, explicitly activate the
schedule, and use the device's Send test notification action for an OS/browser
display check. Old reminders should be reset to a new future time deliberately.

## Case-Creation Delivery Fix (2026-11-02)

New saved Himbauan/Pemeriksaan cases create an operational announcement for their
Tax/Accounting PICs and active leadership, not every employee. Blank unsaved rows
do not create announcements. Ordinary cell edits do not create a second new-case
announcement.

A read-only production inspection found 11 recent cases without an announcement
or delivery job. A non-executing EXPLAIN diagnostic reproduced SQLSTATE 42702:
`announcement_id` in `enqueue_operational_announcement` was both a local variable
and an outbox column, making its ON CONFLICT target ambiguous. The corrective
migration is `20261102094113_fix_announcement_outbox_variable_ambiguity.sql`.
It renames local variables, retains the function signature and service-role-only
execution, and does not rewrite cases, announcements, permissions or history.
The corresponding corrected statement passed the read-only planner diagnostic.

Apply only this reviewed migration, not an unreviewed `supabase db push`; the
project has historical migration-ledger differences. The function-only fix was
applied with explicit approval on 2026-11-02 to project `kedpcolyklquhfjzimvx`;
the local filename matches production ledger version `20261102094113`.
Existing missed notifications are not
automatically backfilled or broadcast. If recovery is requested, review the
specific cases, recipients and stable event keys before creating old events.

Post-migration verification called the corrected function as `service_role` in
an explicitly rolled-back transaction. It confirmed a first enqueue, the same
announcement ID on retry without duplicate jobs, and rejection/rollback for an
invalid recipient. No user inbox records were written and zero diagnostic
announcements persisted. `anon` and `authenticated` still cannot execute the
function; `service_role` can. Cases and historical announcements were not
rewritten or backfilled. Application/UI changes remain a separate GitHub/deploy
step, while the corrected function is already active for existing server calls.

Notification errors no longer masquerade as a case-save failure or disappear
entirely. Creation returns its saved case plus `announcementStatus` (delivered,
queued or failed); the sheet reports delivery issues without inviting duplicate
case creation. A failure before enqueue has no durable retry job; once enqueue
succeeds, the existing delivery worker can retry delivery. A failed helper call
can also occur after enqueue, so the UI says delivery was not confirmed rather
than asserting that no announcement exists.

The creator refreshes their inbox after a successful new-case save without
waiting for that read to finish. Bulk creation refreshes once after the batch.
Opening the desktop inbox fetches current data, and background reads update an
already-open mobile Alerts page. Older reads cannot replace a newer inbox
response. Other active sessions retain the existing two-minute polling interval;
opening Alerts/inbox or returning to the tab also refreshes. This is not Realtime.

The existing immediate Web Push attempt and daily retry schedule are unchanged.
An in-app fix does not guarantee browser push when permission/keys/subscriptions
are absent. Existing case creation remains durable if notification delivery fails.

## Production Delivery Model

Use a server-owned notification model:

1. Store announcements, recipients, read timestamps, and sender identity in the database.
2. Enforce that only authorized supervisors, team leaders, partners, or admins can create broadcasts.
3. Store a web-push subscription for each employee device only after that employee explicitly grants notification permission.
4. Send push messages from a trusted server or background job using VAPID credentials.
5. Keep the in-app inbox as the durable record, even when push delivery fails or is disabled.
6. Log creation, delivery attempts, reads, and deletes in the activity trail.

## Important Constraints

- A browser notification cannot reach a closed phone browser without a service worker and push subscription.
- Production web push requires HTTPS. `localhost` is acceptable only for development.
- Do not request notification permission automatically; the employee must opt in from a clear settings action.
- Device subscriptions and employee identities are sensitive operational data and must be protected by server-side authorization.

## Suggested Database Tables

- `announcements`: subject, message, audience, sender, published timestamp, expiry timestamp
- `announcement_recipients`: announcement ID, staff ID, read timestamp
- `push_subscriptions`: staff ID, endpoint, encrypted browser keys, device metadata, revoked timestamp
- `notification_deliveries`: notification ID, channel, status, provider response, attempted timestamp

This keeps broadcasts auditable, supports reliable inbox history, and avoids using local browser state as a source of truth.
