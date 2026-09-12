import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isMissingDisplayNameError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || error?.code === "PGRST204" || /display_name.*schema cache/i.test(error?.message || "");
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  let { data, error } = await supabase
    .from("staff_profiles")
    .select("id, full_name, display_name, username, team_division, role, auth_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Keep role-based navigation usable until an existing environment runs the
  // display-name migration. The next successful migration enables the new field.
  if (isMissingDisplayNameError(error)) {
    const legacy = await supabase
      .from("staff_profiles")
      .select("id, full_name, username, team_division, role, auth_user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    data = legacy.data ? { ...legacy.data, display_name: legacy.data.full_name } : null;
    error = legacy.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ user: { id: user.id, email: user.email }, profile: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const body = await request.json();
  const fullName = String(body.fullName || "").trim();
  const displayName = String(body.displayName || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const teamDivision = body.teamDivision === "Accounting Team" ? "Accounting Team" : "Tax Team";
  if (fullName.length < 2 && displayName.length < 2) {
    return NextResponse.json({ error: "Display name must contain at least 2 characters." }, { status: 400 });
  }
  if (username && !/^[a-z0-9._-]{3,40}$/.test(username)) {
    return NextResponse.json({ error: "Username must use 3-40 lowercase letters, numbers, dots, dashes, or underscores." }, { status: 400 });
  }

  const usernameUpdate = username ? { username } : {};
  const profileFields = "id, full_name, display_name, username, team_division, role, auth_user_id";
  // Onboarding includes fullName and may create a profile. Regular profile
  // edits must update the existing row so full_name is never accidentally null.
  const profileRequest = fullName
    ? supabase
      .from("staff_profiles")
      .upsert({ auth_user_id: user.id, full_name: fullName, display_name: displayName || fullName, username: username || null, team_division: teamDivision }, { onConflict: "auth_user_id" })
      .select(profileFields)
      .single()
    : supabase
      .from("staff_profiles")
      .update({ display_name: displayName, ...usernameUpdate, team_division: teamDivision })
      .eq("auth_user_id", user.id)
      .select(profileFields)
      .maybeSingle();

  let { data, error } = await profileRequest;

  if (isMissingDisplayNameError(error)) {
    // An existing database may not yet have display_name. Team and username
    // updates must remain available while the migration is awaiting execution.
    const legacyUpdate = {
      ...(fullName ? { full_name: fullName } : {}),
      ...usernameUpdate,
      team_division: teamDivision
    };
    const legacy = await supabase
      .from("staff_profiles")
      .update(legacyUpdate)
      .eq("auth_user_id", user.id)
      .select("id, full_name, username, team_division, role, auth_user_id")
      .maybeSingle();
    if (!legacy.data && !legacy.error) {
      return NextResponse.json({ error: "Staff profile was not found. Please complete onboarding first." }, { status: 404 });
    }
    data = legacy.data ? { ...legacy.data, display_name: legacy.data.full_name } : null;
    error = legacy.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
