import { NextResponse } from "next/server";
import { createOperationalAnnouncement } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

async function currentProfile() {
  const supabase = await createClient();
  if (!supabase) return { error: "Database is not configured.", status: 503 as const };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Authentication is required.", status: 401 as const };
  const { data: profile, error } = await supabase.from("staff_profiles").select("id, full_name, display_name, team_division, role").eq("auth_user_id", user.id).maybeSingle();
  if (error || !profile) return { error: "Staff profile was not found.", status: 403 as const };
  return { user, profile, supabase };
}

export async function GET() {
  const current = await currentProfile();
  if ("error" in current) return NextResponse.json({ error: current.error }, { status: current.status });
  const { data, error } = await current.supabase
    .from("announcement_recipients")
    .select("read_at, announcements(id, title, message, audience, created_at, staff_profiles!announcements_sender_profile_id_fkey(display_name, full_name))")
    .eq("staff_profile_id", current.profile.id)
    .order("announcement_id", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const announcements = (data || []).map((row: any) => ({
    id: row.announcements?.id,
    title: row.announcements?.title,
    message: row.announcements?.message,
    audience: row.announcements?.audience,
    createdAt: row.announcements?.created_at,
    sender: row.announcements?.staff_profiles?.display_name || row.announcements?.staff_profiles?.full_name || "Management",
    readAt: row.read_at
  })).filter((item) => item.id);
  return NextResponse.json({ announcements });
}

export async function POST(request: Request) {
  const current = await currentProfile();
  if ("error" in current) return NextResponse.json({ error: current.error }, { status: current.status });
  if (!['leader', 'supervisor', 'partner', 'admin'].includes(String(current.profile.role).toLowerCase())) {
    return NextResponse.json({ error: "Only leadership can publish announcements." }, { status: 403 });
  }
  const body = await request.json();
  const title = String(body.title || "").trim();
  const message = String(body.message || "").trim();
  const audience = ["all", "tax", "accounting"].includes(body.audience) ? body.audience : "all";
  if (!title || !message) return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  try {
    const result = await createOperationalAnnouncement({
      title,
      message,
      audience,
      senderProfileId: current.profile.id,
      // A manual broadcast may intentionally have the same wording twice, so
      // its event key is unique to this explicit publish action.
      eventKey: `broadcast:${current.profile.id}:${crypto.randomUUID()}`,
      sourceType: "broadcast"
    });
    return NextResponse.json({ announcement: { id: result.id, title, message, audience }, recipients: result.recipientCount }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not publish announcement." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const current = await currentProfile();
  if ("error" in current) return NextResponse.json({ error: current.error }, { status: current.status });
  const { announcementId } = await request.json();
  if (!announcementId) return NextResponse.json({ error: "Announcement id is required." }, { status: 400 });
  const { error } = await current.supabase.from("announcement_recipients").update({ read_at: new Date().toISOString() }).eq("announcement_id", announcementId).eq("staff_profile_id", current.profile.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
