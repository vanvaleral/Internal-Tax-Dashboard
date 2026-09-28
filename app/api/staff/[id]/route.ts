import { NextResponse } from "next/server";
import { currentActor, isLeadership, type CurrentActor, type StaffRole } from "@/lib/access";
import { STAFF_DIRECTORY_TEAMS, isStaffDirectoryRole, canManageDirectoryRole } from "@/lib/staff-directory";
import { createOperationalAnnouncement, notificationEventKey } from "@/lib/notifications";
import { createHash, randomBytes, randomUUID } from "node:crypto";

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
  const { data: existing, error: existingError } = await actor.admin.from("staff_profiles").select("id, full_name, display_name, employment_title, team_division, role, directory_active, auth_user_id, archived_at, access_deletion_started_at, access_deleted_at").eq("id", id).maybeSingle();
  if (existingError || !existing) return NextResponse.json({ error: existingError?.message || "Staff profile was not found." }, { status: 404 });

  const body = await request.json();
  if (body.action === "regenerate-claim-code") {
    if (!canManageDirectoryRole(actor.profile.role, existing.role as StaffRole, existing.role as StaffRole)) {
      return NextResponse.json({ error: "Only a Partner can regenerate a Partner/Admin claim code." }, { status: 403 });
    }
    if (existing.auth_user_id || !existing.directory_active) {
      return NextResponse.json({ error: "Claim codes can only be regenerated for active, unregistered staff." }, { status: 409 });
    }
    const claimCode = `STAFF-${randomBytes(16).toString("hex").toUpperCase()}`;
    const claimCodeHash = createHash("sha256").update(claimCode).digest("hex");
    const { data: updated, error: updateError } = await actor.admin.from("staff_profiles")
      .update({ claim_code_hash: claimCodeHash })
      .eq("id", id).is("auth_user_id", null).eq("directory_active", true)
      .select("id").maybeSingle();
    if (updateError) return NextResponse.json({ error: "Could not regenerate the staff claim code." }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "This profile changed while the code was being regenerated. Refresh PIC Access." }, { status: 409 });
    try { await notifyLeadership(actor, "Regenerated claim code for", existing.display_name || existing.full_name); }
    catch (notificationError) { console.error("[staff] claim code notification could not be created", notificationError); }
    return NextResponse.json({ claimCode, staffName: existing.display_name || existing.full_name }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.directoryActive === false) return NextResponse.json({ error: "Use the archive action to remove staff access." }, { status: 400 });
  if (existing.directory_active === false) {
    if (body.directoryActive !== true) return NextResponse.json({ error: "Restore this profile before editing it." }, { status: 409 });
    if (existing.access_deletion_started_at || existing.access_deleted_at) return NextResponse.json({ error: "This staff access is already being deleted or has expired." }, { status: 409 });
    if (existing.archived_at && Date.now() >= new Date(existing.archived_at).getTime() + 14 * 86400000) {
      return NextResponse.json({ error: "The 14-day restore window has expired." }, { status: 409 });
    }
  }
  const nextRole = String(body.role ?? existing.role).toLowerCase();
  const nextTeam = String(body.teamDivision ?? existing.team_division ?? "");
  const nextFullName = String(body.fullName ?? existing.full_name).trim();
  const nextDisplayName = String(body.displayName ?? existing.display_name ?? existing.full_name).trim();
  const nextTitle = String(body.employmentTitle ?? existing.employment_title ?? "").trim();
  const nextActive = typeof body.directoryActive === "boolean" ? body.directoryActive : existing.directory_active;
  if (!isStaffDirectoryRole(nextRole) || !(STAFF_DIRECTORY_TEAMS as readonly string[]).includes(nextTeam) || nextFullName.length < 2 || !nextDisplayName) return NextResponse.json({ error: "Enter a valid name, team, and role." }, { status: 400 });
  if (!canManageDirectoryRole(actor.profile.role, existing.role as StaffRole, nextRole)) return NextResponse.json({ error: "Only a Partner can change a Partner/Admin profile or grant that role." }, { status: 403 });
  if (id === actor.profile.id && !nextActive) return NextResponse.json({ error: "You cannot archive your own profile." }, { status: 400 });

  let update = actor.admin.from("staff_profiles").update({ full_name: nextFullName, display_name: nextDisplayName, employment_title: nextTitle || null, team_division: nextTeam, role: nextRole, directory_active: nextActive, ...(existing.directory_active === false ? { archived_at: null } : {}) }).eq("id", id);
  if (existing.directory_active === false) {
    const restoreCutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    update = update.eq("directory_active", false).is("access_deletion_started_at", null).is("access_deleted_at", null)
      .or(`archived_at.is.null,archived_at.gt.${restoreCutoff}`);
  } else {
    update = update.eq("directory_active", true);
  }
  const { data, error } = await update.select("id, full_name, display_name, employment_title, team_division, role, auth_user_id, claimed_at, directory_active, archived_at").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This profile changed while it was being restored. Refresh PIC Access." }, { status: 409 });
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
  if (!existing.directory_active) return NextResponse.json({ error: "This profile is already archived." }, { status: 409 });
  if (existing.role === "partner" && existing.directory_active) {
    const { count } = await actor.admin.from("staff_profiles").select("id", { count: "exact", head: true }).eq("directory_active", true).eq("role", "partner");
    if ((count || 0) <= 1) return NextResponse.json({ error: "At least one active Partner profile must remain." }, { status: 400 });
  }
  const { data: archived, error } = await actor.admin.from("staff_profiles")
    .update({ directory_active: false, archived_at: new Date().toISOString() })
    .eq("id", id).eq("directory_active", true).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!archived) return NextResponse.json({ error: "This profile changed while it was being archived. Refresh PIC Access." }, { status: 409 });
  try { await notifyLeadership(actor, "Archived staff profile", existing.display_name || existing.full_name); } catch (notificationError) { console.error("[staff] directory notification failed", notificationError); }
  return NextResponse.json({ ok: true });
}
