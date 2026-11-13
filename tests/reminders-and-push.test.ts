import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import webpush from "web-push";
import { reminderInstant } from "../lib/my-work-reminders.ts";
import { notificationDestination, webPushConfiguration } from "../lib/web-push.ts";
import { loadRoute, mockDatabase } from "./route-harness.ts";

test("reminders require an explicit timezone and retain the requested instant, including WITA and UTC day boundaries", () => {
  assert.equal(reminderInstant("2026-11-20T09:00:00+08:00"), "2026-11-20T01:00:00.000Z");
  assert.equal(reminderInstant("2026-11-20T01:00:00+08:00"), "2026-11-19T17:00:00.000Z");
  assert.equal(reminderInstant("2028-02-29T09:00Z"), "2028-02-29T09:00:00.000Z");
  assert.equal(reminderInstant(""), null);
  for (const value of ["2026-11-20T09:00", "2026-02-29T09:00Z", "2026-11-20T25:00Z", "2026-11-20T09:00+99:00", "2026-11-20T09:00+14:30", 123]) assert.throws(() => reminderInstant(value));
});

test("push configuration checks both keys, their pairing and subject without exposing private credentials", () => {
  const names = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"], before = names.map(name => process.env[name]);
  try {
    const keys = webpush.generateVAPIDKeys();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = keys.publicKey; delete process.env.VAPID_PRIVATE_KEY;
    assert.equal(webPushConfiguration().configured, false);
    process.env.VAPID_PRIVATE_KEY = keys.privateKey; process.env.VAPID_SUBJECT = "mailto:test@example.com";
    assert.equal(webPushConfiguration().configured, true);
    assert.equal(JSON.stringify(webPushConfiguration()).includes(keys.privateKey), false);
    process.env.VAPID_PRIVATE_KEY = webpush.generateVAPIDKeys().privateKey;
    assert.equal(webPushConfiguration().configured, false);
  } finally { names.forEach((name, index) => { if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index]; }); }
  assert.match(notificationDestination("my_work_reminder", "task-id"), /view=my-work-view&task=task-id/);
});

function subscriptions() {
  const db = mockDatabase({ web_push_subscriptions: [
    { id: "own-device", staff_profile_id: "own", endpoint: "https://push.invalid/own", p256dh: "key", auth: "auth" },
    { id: "other-device", staff_profile_id: "other", endpoint: "https://push.invalid/other", p256dh: "key", auth: "auth" }
  ] });
  let configured = true, allowed = true, status = 0;
  const sends: any[] = [];
  db.rpc = async () => ({ data: allowed, error: null });
  const route = loadRoute("app/api/push-subscriptions/route.ts", {
    "@/lib/access": { currentActor: async () => ({ admin: db, profile: { id: "own" } }) },
    "@/lib/web-push": { webPushConfiguration: () => ({ configured, message: "Configuration needs attention" }) },
    "web-push": { default: { sendNotification: async (subscription: any, payload: string, options: any) => { sends.push({ subscription, payload, options }); if (status) throw { statusCode: status }; } } }
  });
  const req = (body: any) => new Request("https://test.invalid/api/push-subscriptions", { method: "POST", body: JSON.stringify(body) });
  return { db, route, req, sends, configure: (value: boolean) => { configured = value; }, allow: (value: boolean) => { allowed = value; }, status: (value: number) => { status = value; } };
}

test("push settings distinguish this device from other registered devices and block incomplete server configuration", async () => {
  const d = subscriptions();
  let response = await d.route.GET(new Request("https://test.invalid/api/push-subscriptions", { headers: { "x-push-endpoint": "https://push.invalid/other" } }));
  assert.equal(response.body.enabled, true); assert.equal(response.body.deviceEnabled, false);
  response = await d.route.GET(new Request("https://test.invalid/api/push-subscriptions", { headers: { "x-push-endpoint": "https://push.invalid/own" } }));
  assert.equal(response.body.deviceEnabled, true);
  d.configure(false);
  assert.equal((await d.route.GET(new Request("https://test.invalid/api/push-subscriptions"))).body.configured, false);
  assert.equal((await d.route.POST(d.req({ action: "test", endpoint: "https://push.invalid/own" }))).status, 503);
  assert.equal(d.sends.length, 0);
});

test("test pushes are self-only, rate limited, distinguish provider acceptance and clean expired subscriptions", async () => {
  const d = subscriptions();
  assert.equal((await d.route.POST(d.req({ action: "test", endpoint: "https://push.invalid/other" }))).status, 404);
  assert.equal(d.sends.length, 0);
  d.allow(false);
  assert.equal((await d.route.POST(d.req({ action: "test", endpoint: "https://push.invalid/own" }))).status, 429);
  d.allow(true);
  const first = await d.route.POST(d.req({ action: "test", endpoint: "https://push.invalid/own" }));
  assert.equal(first.body.accepted, true);
  assert.equal(d.sends.length, 1);
  assert.equal(JSON.parse(d.sends[0].payload).tag, first.body.tag);
  assert.equal(JSON.parse(d.sends[0].payload).renotify, true);
  assert.equal(d.sends[0].options.urgency, "high"); assert.equal(d.sends[0].options.TTL, 60);
  const second = await d.route.POST(d.req({ action: "test", endpoint: "https://push.invalid/own" }));
  assert.notEqual(second.body.tag, first.body.tag, "explicit tests must not silently replace each other");
  d.status(410);
  assert.equal((await d.route.POST(d.req({ action: "test", endpoint: "https://push.invalid/own" }))).status, 410);
  assert.deepEqual(d.db.tables.web_push_subscriptions.map(row => row.id), ["other-device"]);
});

test("turning off one device cannot delete all devices or another user's subscription", async () => {
  const d = subscriptions();
  assert.equal((await d.route.DELETE(d.req({}))).status, 400);
  assert.equal(d.db.tables.web_push_subscriptions.length, 2);
  await d.route.DELETE(d.req({ endpoint: "https://push.invalid/other" }));
  assert.equal(d.db.tables.web_push_subscriptions.length, 2);
  await d.route.DELETE(d.req({ endpoint: "https://push.invalid/own" }));
  assert.deepEqual(d.db.tables.web_push_subscriptions.map(row => row.id), ["other-device"]);
});

test("the delivery worker rejects unauthenticated calls and uses atomic leases for retry-safe bounded delivery", async () => {
  const db = mockDatabase({ staff_profiles: [{ id: "own", directory_active: true }], announcement_recipients: [], notification_delivery_log: [{ id: 1 }] });
  const calls: string[] = [];
  const jobs = [{ id: 1, announcement_id: "announcement", staff_profile_id: "own", channel: "in_app", attempts: 2, max_attempts: 8 }];
  db.rpc = async (name, args) => { calls.push(name); return name === "authorize_notification_scheduler" ? { data: args.p_token === "synthetic-token", error: null } : { data: jobs, error: null }; };
  const route = loadRoute("app/api/maintenance/deliver-notifications/route.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => db }, "web-push": {}, "@/lib/web-push": {}
  });
  const req = (auth = "") => ({ headers: new Headers({ authorization: auth }) });
  assert.equal((await route.GET(req())).status, 401);
  assert.equal((await route.GET(req("synthetic-token"))).status, 401);
  assert.equal((await route.GET(req("Bearer wrong"))).status, 401);
  const result = await route.GET(req("Bearer synthetic-token"));
  assert.equal(result.body.delivered, 1); assert.ok(calls.includes("claim_notification_deliveries"));
  assert.equal(db.tables.notification_delivery_log[0].status, "delivered");
});

test("service-worker clicks are same-origin only and notification payloads use an existing icon", async () => {
  const handlers: Record<string, any> = {}, shown: any[] = [], opened: string[] = [];
  const self = { location: { origin: "https://test.invalid" }, addEventListener: (name: string, handler: any) => { handlers[name] = handler; }, registration: { showNotification: async (title: string, options: any) => { shown.push({ title, options }); } } };
  const clients = { matchAll: async () => [], openWindow: async (url: string) => { opened.push(url); } };
  new Function("self", "clients", readFileSync(new URL("../public/push-sw.js", import.meta.url), "utf8"))(self, clients);
  let pending: Promise<any>;
  handlers.push({ data: { json: () => ({ title: "Reminder" }) }, waitUntil: (value: Promise<any>) => { pending = value; } }); await pending!;
  assert.equal(shown[0].options.icon, "/icons/app-desktop-v2-192.png");
  assert.equal(shown[0].options.renotify, false, "ordinary retries remain quiet");
  handlers.push({ data: { json: () => ({ tag: "lmats-push-test-example", renotify: true }) }, waitUntil: (value: Promise<any>) => { pending = value; } }); await pending!;
  assert.equal(shown[1].options.renotify, true);
  handlers.push({ data: { json: () => ({ tag: "ordinary-event", renotify: true }) }, waitUntil: (value: Promise<any>) => { pending = value; } }); await pending!;
  assert.equal(shown[2].options.renotify, false);
  handlers.notificationclick({ notification: { close() {}, data: { url: "https://evil.invalid" } }, waitUntil: (value: Promise<any>) => { pending = value; } }); await pending!;
  assert.deepEqual(opened, ["https://test.invalid/dashboard"]);
});

test("push-only service worker updates activate without closing all dashboard windows", async () => {
  const handlers: Record<string, any> = {}, calls: string[] = [];
  const self = { addEventListener: (name: string, handler: any) => { handlers[name] = handler; }, skipWaiting: async () => { calls.push("skipWaiting"); } };
  const clients = { claim: async () => { calls.push("claim"); } };
  new Function("self", "clients", readFileSync(new URL("../public/push-sw.js", import.meta.url), "utf8"))(self, clients);
  for (const event of ["install", "activate"]) {
    let pending: Promise<any>;
    handlers[event]({ waitUntil: (value: Promise<any>) => { pending = value; } }); await pending!;
  }
  assert.deepEqual(calls, ["skipWaiting", "claim"]);
});
