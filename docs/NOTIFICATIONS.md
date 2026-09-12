# Notifications

## Current Demo Behavior

The prototype in `public/demo.html` provides:

- a per-user announcement inbox with unread counts
- a Management broadcast composer for briefing, meeting, and firm-wide notices
- a Wall of Fame announcement after Employee of the Month is finalized
- local browser persistence for demo review

Announcements are now stored in Supabase with per-recipient read status. This makes the in-app inbox shared between logged-in employees. Phone push delivery remains a separate future phase.

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
