import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  if (!['supervisor', 'partner', 'admin'].includes(String(current.profile.role).toLowerCase())) {
    return NextResponse.json({ error: "Only leadership can publish announcements." }, { status: 403 });
  }
  const body = await request.json();
  const title = String(body.title || "").trim();
  const message = String(body.message || "").trim();
  const audience = ["all", "tax", "accounting"].includes(body.audience) ? body.audience : "all";
  if (!title || !message) return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Announcement service is not configured." }, { status: 503 });
  const { data: announcement, error: announcementError } = await admin
    .from("announcements")
    .insert({ title, message, audience, sender_profile_id: current.profile.id })
    .select("id, title, message, audience, created_at")
    .single();
  if (announcementError || !announcement) return NextResponse.json({ error: announcementError?.message || "Could not publish announcement." }, { status: 500 });
  let recipientQuery = admin.from("staff_profiles").select("id");
  if (audience === "tax") recipientQuery = recipientQuery.eq("team_division", "Tax Team");
  if (audience === "accounting") recipientQuery = recipientQuery.eq("team_division", "Accounting Team");
  const { data: recipients, error: recipientError } = await recipientQuery;
  if (recipientError) return NextResponse.json({ error: recipientError.message }, { status: 500 });
  const { error: deliveryError } = await admin.from("announcement_recipients").insert((recipients || []).map((recipient) => ({ announcement_id: announcement.id, staff_profile_id: recipient.id })));
  if (deliveryError) return NextResponse.json({ error: deliveryError.message }, { status: 500 });
  return NextResponse.json({ announcement }, { status: 201 });
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
