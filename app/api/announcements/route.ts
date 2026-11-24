import { NextRequest, NextResponse } from "next/server";
import { createOperationalAnnouncement } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReceiveStaffAccessNotifications } from "@/lib/feature-access";

async function currentProfile() {
  const supabase = await createClient();
  if (!supabase) return { error: "Database is not configured.", status: 503 as const };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Authentication is required.", status: 401 as const };
  const { data: profile, error } = await supabase.from("staff_profiles").select("id, full_name, display_name, team_division, role, directory_active").eq("auth_user_id", user.id).maybeSingle();
  if (error || !profile) return { error: "Staff profile was not found.", status: 403 as const };
  if (profile.directory_active !== true) return { error: "Your staff access has been deactivated.", status: 403 as const };
  return { user, profile, supabase };
}

function mapAnnouncement(row: any, sender: string) {
  return {
    id: row.announcements?.id,
    title: row.announcements?.title,
    message: row.announcements?.message,
    sourceType: row.announcements?.source_type || null,
    audience: row.announcements?.source_type === "staff_directory" ? "leadership" : row.announcements?.audience,
    createdAt: row.announcements?.created_at,
    sender,
    readAt: row.read_at,
    deletedAt: row.deleted_at
  };
}

export async function GET(request: NextRequest) {
  const current = await currentProfile();
  if ("error" in current) return NextResponse.json({ error: current.error }, { status: current.status });
  const includeDeleted = request.nextUrl.searchParams.get("deleted") === "1";
  const { data: deletedRows, error: deletedError } = await current.supabase
    .from("announcement_recipient_trash")
    .select("announcement_id, deleted_at")
    .eq("staff_profile_id", current.profile.id);
  if (deletedError) return NextResponse.json({ error: deletedError.message }, { status: 500 });
  const deletedById = new Map((deletedRows || []).map((row: any) => [row.announcement_id, row.deleted_at]));
  const { data, error } = await current.supabase
    .from("announcement_recipients")
    .select("read_at, announcements(id, title, message, audience, created_at, sender_profile_id, source_type)")
    .eq("staff_profile_id", current.profile.id)
    .order("announcement_id", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data || []).filter((row: any) => row.announcements?.id &&
    deletedById.has(row.announcements.id) === includeDeleted &&
    (row.announcements.source_type !== "staff_directory" || canReceiveStaffAccessNotifications(current.profile.role)));
  // Staff profile RLS is intentionally private. Resolve only the senders of
  // notifications the authenticated recipient was allowed to read.
  const senderNames = new Map([[current.profile.id,current.profile.display_name || current.profile.full_name]]);
  const senderIds = [...new Set(rows.map((row: any) => row.announcements.sender_profile_id)
    .filter(id => id && id !== current.profile.id))];
  const admin = senderIds.length ? createAdminClient() : null;
  if (admin) for (let offset = 0; offset < senderIds.length; offset += 100) {
    const result = await admin.from("staff_profiles").select("id, display_name, full_name").in("id",senderIds.slice(offset,offset+100));
    if (!result.error) for (const profile of result.data || []) senderNames.set(profile.id,profile.display_name || profile.full_name);
  }
  const announcements = rows.map((row: any) => ({
    ...mapAnnouncement(row, senderNames.get(row.announcements.sender_profile_id) || (row.announcements.sender_profile_id ? "Unknown sender" : "System")),
    deletedAt: deletedById.get(row.announcements.id) || null
  }));
  return NextResponse.json({ announcements },{headers:{"Cache-Control":"private, no-store"}});
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
  const { announcementId, action } = await request.json();
  if (!announcementId) return NextResponse.json({ error: "Announcement id is required." }, { status: 400 });
  if (action === "restore") {
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await current.supabase.from("announcement_recipient_trash").delete().eq("announcement_id", announcementId).eq("staff_profile_id", current.profile.id).gte("deleted_at", cutoff).select("announcement_id").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "This announcement's recovery period has expired or it was already restored." }, { status: 410 });
    return NextResponse.json({ ok: true });
  }
  const { error } = await current.supabase.from("announcement_recipients").update({ read_at: new Date().toISOString() }).eq("announcement_id", announcementId).eq("staff_profile_id", current.profile.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const current = await currentProfile();
  if ("error" in current) return NextResponse.json({ error: current.error }, { status: current.status });
  const { announcementId } = await request.json().catch(() => ({}));
  if (!announcementId) return NextResponse.json({ error: "Announcement id is required." }, { status: 400 });
  const { error } = await current.supabase.from("announcement_recipient_trash").upsert({ announcement_id: announcementId, staff_profile_id: current.profile.id, deleted_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message === "new row violates row-level security policy" ? "This announcement is not in your inbox." : error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
