import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,40}$/;

export async function POST(request: Request) {
  const referralCode = process.env.INVITE_REFERRAL_CODE;
  const admin = createAdminClient();
  if (!referralCode || !admin) {
    return NextResponse.json({ error: "Registration is not configured." }, { status: 503 });
  }

  const body = await request.json();
  const code = String(body.referralCode || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const fullName = String(body.fullName || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const teamDivision = body.teamDivision === "Accounting Team" ? "Accounting Team" : "Tax Team";

  if (code !== referralCode) return NextResponse.json({ error: "Referral code is not valid." }, { status: 401 });
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must contain at least 8 characters." }, { status: 400 });
  if (fullName.length < 2) return NextResponse.json({ error: "Full name must contain at least 2 characters." }, { status: 400 });
  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ error: "Username must use 3-40 lowercase letters, numbers, dots, dashes, or underscores." }, { status: 400 });
  }

  // Confirm that the required staff-profile schema is available before creating
  // an Auth account, preventing an orphan account when setup is incomplete.
  const schemaCheck = await admin.from("staff_profiles").select("id, username, display_name").limit(1);
  if (schemaCheck.error) {
    return NextResponse.json({ error: "Registration database setup is incomplete. Run the staff-profile migrations first." }, { status: 503 });
  }

  const { data: existingUsername, error: usernameError } = await admin
    .from("staff_profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (usernameError) return NextResponse.json({ error: "Could not check username availability." }, { status: 500 });
  if (existingUsername) return NextResponse.json({ error: "That username is already in use." }, { status: 409 });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message || "Could not create the account." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await admin
    .from("staff_profiles")
    .update({ full_name: fullName, display_name: fullName, username, team_division: teamDivision, role: "staff" })
    .eq("auth_user_id", created.user.id)
    .select("id")
    .maybeSingle();
  if (profileError || !profile) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "Could not set up the staff profile. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ email }, { status: 201 });
}
