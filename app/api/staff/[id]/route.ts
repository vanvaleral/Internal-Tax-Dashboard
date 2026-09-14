import { NextResponse } from "next/server";
import { currentActor, isLeadership, type CurrentActor, type StaffRole } from "@/lib/access";
import { STAFF_DIRECTORY_TEAMS, isStaffDirectoryRole, canManageDirectoryRole } from "@/lib/staff-directory";
import { createOperationalAnnouncement, notificationEventKey } from "@/lib/notifications";
import { randomUUID } from "node:crypto";

type Context = { params: Promise<{ id: string }> };

async function notifyLeadership(actor: CurrentActor, action: string, subject: string) {
  const { data: recipients, error } = await actor.admin.from("staff_profiles").select("id").eq("directory_active", true).in("role", ["leader", "partner"]);
  if (error || !(recipients || []).length) return;
  await createOperationalAnnouncement({
    title: `PIC Access: ${action}`,
    message: `${actor.profile.display_name || actor.profile.full_name} ${action.toLowerCase()} ${subject}.`,
    senderProfileId: actor.profile.id,
    recipientProfileIds: recipients.map((item) => item.id),
    eventKey: notificationEventKey("staff-directory", randomUUID(), action.toLowerCase().replace(/\s+/g, "-")),
    sourceType: "staff_directory"
  });
}

export async function PATCH(request: Request, context: Context) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Only leadership can change PIC Access." }, { status: 403 });
  const { id } = await context.params;
  const { data: existing, error: existingError } = await actor.admin.from("staff_profiles").select("id, full_name, display_name, employment_title, team_division, role, directory_active").eq("id", id).maybeSingle();
  if (existingError || !existing) return NextResponse.json({ error: existingError?.message || "Staff profile was not found." }, { status: 404 });

  const body = await request.json();
  const nextRole = String(body.role ?? existing.role).toLowerCase();
  const nextTeam = String(body.teamDivision ?? existing.team_division ?? "");
  const nextFullName = String(body.fullName ?? existing.full_name).trim();
  const nextDisplayName = String(body.displayName ?? existing.display_name ?? existing.full_name).trim();
  const nextTitle = String(body.employmentTitle ?? existing.employment_title ?? "").trim();
  const nextActive = typeof body.directoryActive === "boolean" ? body.directoryActive : existing.directory_active;
  if (!isStaffDirectoryRole(nextRole) || !(STAFF_DIRECTORY_TEAMS as readonly string[]).includes(nextTeam) || nextFullName.length < 2 || !nextDisplayName) return NextResponse.json({ error: "Enter a valid name, team, and role." }, { status: 400 });
  if (!canManageDirectoryRole(actor.profile.role, existing.role as StaffRole, nextRole)) return NextResponse.json({ error: "Only a Partner can change a Partner/Admin profile or grant that role." }, { status: 403 });
  if (id === actor.profile.id && !nextActive) return NextResponse.json({ error: "You cannot archive your own profile." }, { status: 400 });

  const { data, error } = await actor.admin.from("staff_profiles").update({ full_name: nextFullName, display_name: nextDisplayName, employment_title: nextTitle || null, team_division: nextTeam, role: nextRole, directory_active: nextActive }).eq("id", id).select("id, full_name, display_name, employment_title, team_division, role, auth_user_id, claimed_at, directory_active").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try { await notifyLeadership(actor, nextActive ? "Updated staff access" : "Archived staff profile", nextDisplayName); } catch (notificationError) { console.error("[staff] directory notification failed", notificationError); }
  return NextResponse.json({ staff: data });
}

export async function DELETE(_request: Request, context: Context) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Only leadership can archive a staff profile." }, { status: 403 });
  const { id } = await context.params;
  if (id === actor.profile.id) return NextResponse.json({ error: "You cannot archive your own profile." }, { status: 400 });
  const { data: existing, error: existingError } = await actor.admin.from("staff_profiles").select("id, full_name, display_name, role, directory_active").eq("id", id).maybeSingle();
  if (existingError || !existing) return NextResponse.json({ error: existingError?.message || "Staff profile was not found." }, { status: 404 });
  if (!canManageDirectoryRole(actor.profile.role, existing.role as StaffRole, existing.role as StaffRole)) return NextResponse.json({ error: "Only a Partner can archive a Partner/Admin profile." }, { status: 403 });
  if (existing.role === "partner" && existing.directory_active) {
    const { count } = await actor.admin.from("staff_profiles").select("id", { count: "exact", head: true }).eq("directory_active", true).eq("role", "partner");
    if ((count || 0) <= 1) return NextResponse.json({ error: "At least one active Partner profile must remain." }, { status: 400 });
  }
  const { error } = await actor.admin.from("staff_profiles").update({ directory_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try { await notifyLeadership(actor, "Archived staff profile", existing.display_name || existing.full_name); } catch (notificationError) { console.error("[staff] directory notification failed", notificationError); }
  return NextResponse.json({ ok: true });
}
