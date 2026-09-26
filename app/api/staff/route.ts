import { NextResponse } from "next/server";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { currentActor, isLeadership, type CurrentActor } from "@/lib/access";
import { STAFF_DIRECTORY_TEAMS, isStaffDirectoryRole, canManageDirectoryRole } from "@/lib/staff-directory";
import { createOperationalAnnouncement, notificationEventKey } from "@/lib/notifications";

async function notifyLeadershipOfDirectoryChange(actor: CurrentActor, action: string, subject: string) {
  const { data: recipients, error } = await actor.admin
    .from("staff_profiles")
    .select("id")
    .eq("directory_active", true)
    .in("role", ["leader", "partner"]);
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

export async function GET(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "1";
  if (includeInactive && !isLeadership(actor.profile.role)) return NextResponse.json({ error: "Only leadership can view archived staff profiles." }, { status: 403 });

  let query = actor.admin
    .from("staff_profiles")
    .select("*")
    .order("display_name");
  if (!includeInactive) query = query.eq("directory_active", true);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const staff = (data || []).map((profile) => {
    const base = { id: profile.id, full_name: profile.full_name, display_name: profile.display_name || profile.full_name, team_division: profile.team_division, role: profile.role };
    return isLeadership(actor.profile.role)
      ? { ...base, employment_title: profile.employment_title || null, auth_user_id: profile.auth_user_id || null, claimed_at: profile.claimed_at || null, directory_active: profile.directory_active !== false }
      : base;
  });
  return NextResponse.json({ staff });
}

export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Only leadership can add a staff profile." }, { status: 403 });

  const body = await request.json();
  const fullName = String(body.fullName || "").trim();
  const displayName = String(body.displayName || fullName).trim();
  const employmentTitle = String(body.employmentTitle || "").trim();
  const teamDivision = String(body.teamDivision || "");
  const role = String(body.role || "staff").toLowerCase();
  if (fullName.length < 2 || displayName.length < 1) return NextResponse.json({ error: "Enter a full name and display name." }, { status: 400 });
  if (!(STAFF_DIRECTORY_TEAMS as readonly string[]).includes(teamDivision) || !isStaffDirectoryRole(role)) return NextResponse.json({ error: "Choose a valid team and role." }, { status: 400 });
  if (!canManageDirectoryRole(actor.profile.role, "staff", role)) return NextResponse.json({ error: "Only a Partner can create Partner or Admin profiles." }, { status: 403 });

  const { data: duplicate, error: duplicateError } = await actor.admin
    .from("staff_profiles")
    .select("id")
    .or(`full_name.ilike.${fullName},display_name.ilike.${displayName}`)
    .limit(1);
  if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 });
  if ((duplicate || []).length) return NextResponse.json({ error: "A staff profile with this name or display name already exists." }, { status: 409 });

  const claimCode = `STAFF-${randomBytes(16).toString("hex").toUpperCase()}`;
  const claimCodeHash = createHash("sha256").update(claimCode).digest("hex");
  const { data, error } = await actor.admin.from("staff_profiles").insert({
    full_name: fullName,
    display_name: displayName,
    employment_title: employmentTitle || null,
    team_division: teamDivision,
    role,
    claim_code_hash: claimCodeHash,
    directory_active: true
  }).select("id, full_name, display_name, employment_title, team_division, role, auth_user_id, claimed_at, directory_active").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try { await notifyLeadershipOfDirectoryChange(actor, "Added staff profile", displayName); } catch (notificationError) { console.error("[staff] directory notification failed", notificationError); }
  return NextResponse.json({ staff: data, claimCode }, { status: 201 });
}
