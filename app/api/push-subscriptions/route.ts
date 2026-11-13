import { NextResponse } from "next/server";
import { currentActor } from "@/lib/access";
import webpush from "web-push";
import { webPushConfiguration } from "@/lib/web-push";

function publicKey() {
  return String(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
}

export async function GET(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { count, error } = await actor.admin.from("web_push_subscriptions")
    .select("id", { count: "exact", head: true }).eq("staff_profile_id", actor.profile.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const endpoint = request.headers.get("x-push-endpoint");
  let deviceEnabled = false;
  if (endpoint) {
    const device = await actor.admin.from("web_push_subscriptions").select("id").eq("staff_profile_id", actor.profile.id).eq("endpoint", endpoint).maybeSingle();
    if (device.error) return NextResponse.json({ error: device.error.message }, { status: 500 });
    deviceEnabled = Boolean(device.data);
  }
  const configuration = webPushConfiguration();
  const schedule = await actor.admin.from("notification_scheduler_settings").select("enabled").eq("id", true).maybeSingle();
  return NextResponse.json({ configured: configuration.configured, publicKey: publicKey(), enabled: Number(count || 0) > 0, deviceEnabled, message: configuration.message,
    remindersEnabled: Boolean(schedule.data?.enabled), remindersMessage: schedule.error ? "Task reminders need the database update." : schedule.data?.enabled ? "Task reminder scheduling is active; notifications may take a minute or two." : "Task reminder scheduling is paused pending deployment verification."
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const configuration = webPushConfiguration();
  if (!configuration.configured) return NextResponse.json({ error: configuration.message }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  if (body.action === "test") {
    const endpoint = String(body.endpoint || "");
    const { data: device, error } = await actor.admin.from("web_push_subscriptions").select("id, endpoint, p256dh, auth")
      .eq("staff_profile_id", actor.profile.id).eq("endpoint", endpoint).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!device) return NextResponse.json({ error: "Enable push on this device first." }, { status: 404 });
    const claim = await actor.admin.rpc("claim_push_subscription_test", { p_id: device.id, p_profile_id: actor.profile.id });
    if (claim.error) return NextResponse.json({ error: "Push testing is not ready. Apply the notification migration." }, { status: 503 });
    if (claim.data !== true) return NextResponse.json({ error: "Wait 30 seconds before sending another test." }, { status: 429 });
    try {
      const tag = `lmats-push-test-${crypto.randomUUID()}`;
      await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify({ title: "Tax Dashboard test", body: "Browser push is connected on this device.", tag, renotify: true, url: "/demo.html?view=my-work-view" }), { timeout: 10_000, TTL: 60, urgency: "high" });
      return NextResponse.json({ accepted: true, tag });
    } catch (error) {
      const status = Number((error as { statusCode?: number }).statusCode);
      if ([404, 410].includes(status)) {
        await actor.admin.from("web_push_subscriptions").delete().eq("id", device.id).eq("staff_profile_id", actor.profile.id);
        return NextResponse.json({ error: "This subscription expired. Turn push off and on again." }, { status: 410 });
      }
      return NextResponse.json({ error: `The push service rejected the test${status ? ` (HTTP ${status})` : ""}. Check server VAPID configuration and retry.` }, { status: 502 });
    }
  }
  const subscription = body.subscription;
  const endpoint = String(subscription?.endpoint || "").trim();
  const p256dh = String(subscription?.keys?.p256dh || "").trim();
  const auth = String(subscription?.keys?.auth || "").trim();
  if (!endpoint.startsWith("https://") || !p256dh || !auth) return NextResponse.json({ error: "A valid browser push subscription is required." }, { status: 400 });
  const { error } = await actor.admin.from("web_push_subscriptions").upsert({
    staff_profile_id: actor.profile.id,
    endpoint,
    p256dh,
    auth,
    user_agent: request.headers.get("user-agent") || null,
    last_seen_at: new Date().toISOString()
  }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enabled: true });
}

export async function DELETE(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  if (!body.endpoint) return NextResponse.json({ error: "Specify this device's subscription to disable push." }, { status: 400 });
  let query = actor.admin.from("web_push_subscriptions").delete().eq("staff_profile_id", actor.profile.id);
  if (body.endpoint) query = query.eq("endpoint", String(body.endpoint));
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enabled: false });
}
