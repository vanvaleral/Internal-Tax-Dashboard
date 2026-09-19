import { NextResponse } from "next/server";
import { currentActor } from "@/lib/access";

function publicKey() {
  return String(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
}

export async function GET() {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { count, error } = await actor.admin.from("web_push_subscriptions")
    .select("id", { count: "exact", head: true }).eq("staff_profile_id", actor.profile.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ configured: Boolean(publicKey()), publicKey: publicKey(), enabled: Number(count || 0) > 0 });
}

export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!publicKey() || !process.env.VAPID_PRIVATE_KEY) return NextResponse.json({ error: "Web Push is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
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
  let query = actor.admin.from("web_push_subscriptions").delete().eq("staff_profile_id", actor.profile.id);
  if (body.endpoint) query = query.eq("endpoint", String(body.endpoint));
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enabled: false });
}
