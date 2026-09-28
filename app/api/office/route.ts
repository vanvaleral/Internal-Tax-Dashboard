import { NextResponse } from "next/server";
import { currentActor } from "@/lib/access";

const colors = new Set(["teal", "blue", "coral", "violet", "gold"]);
const desks = new Set(["plant", "lamp", "books", "coffee"]);
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const cutoff = new Date(Date.now() - 45_000).toISOString();
  const [profiles, messages] = await Promise.all([
    actor.admin.from("virtual_office_profiles").select("staff_profile_id, avatar_color, desk_style, x, y, last_seen_at, staff:staff_profiles!virtual_office_profiles_staff_profile_id_fkey(display_name, full_name)").gte("last_seen_at", cutoff).limit(100),
    actor.admin.from("virtual_office_messages").select("id, staff_profile_id, message, created_at, staff:staff_profiles!virtual_office_messages_staff_profile_id_fkey(display_name, full_name)").order("created_at", { ascending: false }).limit(40)
  ]);
  const error = profiles.error || messages.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
  return NextResponse.json({ me: { id: actor.profile.id, name: actor.profile.display_name || actor.profile.full_name }, profiles: profiles.data, messages: (messages.data || []).reverse() }, { headers: noStore });
}

export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  const x = Number(body.x), y = Number(body.y);
  if (!Number.isInteger(x) || x < 0 || x > 11 || !Number.isInteger(y) || y < 0 || y > 7 || !colors.has(body.avatarColor) || !desks.has(body.deskStyle)) {
    return NextResponse.json({ error: "Invalid office settings." }, { status: 400 });
  }
  const { error } = await actor.admin.from("virtual_office_profiles").upsert({ staff_profile_id: actor.profile.id, avatar_color: body.avatarColor, desk_style: body.deskStyle, x, y, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "staff_profile_id" });
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  if (body.action === "chat") {
    const message = String(body.message || "").trim();
    if (!message || message.length > 280) return NextResponse.json({ error: "Pesan harus berisi 1–280 karakter." }, { status: 400 });
    const { data: latest } = await actor.admin.from("virtual_office_messages").select("created_at").eq("staff_profile_id", actor.profile.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latest && Date.now() - new Date(latest.created_at).getTime() < 1500) return NextResponse.json({ error: "Tunggu sebentar sebelum mengirim pesan lagi." }, { status: 429 });
    const { error } = await actor.admin.from("virtual_office_messages").insert({ staff_profile_id: actor.profile.id, message });
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
