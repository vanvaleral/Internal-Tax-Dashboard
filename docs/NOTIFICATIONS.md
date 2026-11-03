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
