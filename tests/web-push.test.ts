import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Web Push subscriptions are private, profile-bound server records", async () => {
  const [migration, route] = await Promise.all([
    read("supabase/migrations/202609170001_web_push_subscriptions.sql"),
    read("app/api/push-subscriptions/route.ts")
  ]);
  assert.match(migration, /staff_profile_id uuid not null references public\.staff_profiles/);
  assert.match(migration, /revoke all on table public\.web_push_subscriptions from public, anon, authenticated/);
  assert.match(route, /staff_profile_id: actor\.profile\.id/);
  assert.match(route, /\.eq\("staff_profile_id", actor\.profile\.id\)/);
});

test("announcements enqueue immediate Web Push with durable retry", async () => {
  const [notifications, worker, serviceWorker] = await Promise.all([
    read("lib/notifications.ts"),
    read("app/api/maintenance/deliver-notifications/route.ts"),
    read("public/push-sw.js")
  ]);
  assert.match(notifications, /channel: "web_push", status: "queued"/);
  assert.match(notifications, /webpush\.sendNotification/);
  assert.match(worker, /\.in\("status", \["queued", "failed"\]\)/);
  assert.match(worker, /\[404, 410\]/);
  assert.match(serviceWorker, /self\.addEventListener\("push"/);
  assert.match(serviceWorker, /self\.addEventListener\("notificationclick"/);
});
