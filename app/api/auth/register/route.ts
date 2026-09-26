import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,40}$/;

export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Registration is not configured." }, { status: 503 });
  }

  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const username = String(body.username || "").trim().toLowerCase();
  const staffClaimCode = String(body.staffClaimCode || "").trim().toUpperCase();

  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must contain at least 8 characters." }, { status: 400 });
  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ error: "Username must use 3-40 lowercase letters, numbers, dots, dashes, or underscores." }, { status: 400 });
  }
  if (!staffClaimCode) return NextResponse.json({ error: "Enter the staff claim code provided by management." }, { status: 400 });

  // Confirm that the required staff-profile schema is available before creating
  // an Auth account, preventing an orphan account when setup is incomplete.
  const schemaCheck = await admin.from("staff_profiles").select("id, username, display_name, claim_code_hash").limit(1);
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

  const claimCodeHash = createHash("sha256").update(staffClaimCode).digest("hex");
  const { data: pendingProfile, error: pendingProfileError } = await admin
    .from("staff_profiles")
    .select("id, full_name, display_name, auth_user_id")
    .eq("claim_code_hash", claimCodeHash)
    .eq("directory_active", true)
    .is("auth_user_id", null)
    .maybeSingle();
  if (pendingProfileError?.code === "42703" || pendingProfileError?.code === "PGRST204") {
    return NextResponse.json({ error: "Staff directory is not ready. Run the pending staff directory migration first." }, { status: 503 });
  }
  if (pendingProfileError || !pendingProfile) {
    return NextResponse.json({ error: "This staff claim code is invalid or has already been used." }, { status: 401 });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: pendingProfile.full_name }
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message || "Could not create the account." }, { status: 400 });
  }

  // The auth trigger creates a temporary generic profile. Remove it and attach
  // the account to the pre-created roster profile so every existing PIC link
  // continues to point to the same immutable staff_profile ID.
  const { error: temporaryProfileError } = await admin
    .from("staff_profiles")
    .delete()
    .eq("auth_user_id", created.user.id);
  if (temporaryProfileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "Could not prepare the staff profile. Please try again." }, { status: 500 });
  }

  const { data: profile, error: profileError } = await admin
    .from("staff_profiles")
    .update({ auth_user_id: created.user.id, username, claim_code_hash: null, claimed_at: new Date().toISOString() })
    .eq("id", pendingProfile.id)
    .is("auth_user_id", null)
    .eq("claim_code_hash", claimCodeHash)
    .select("id")
    .maybeSingle();
  if (profileError || !profile) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "Could not set up the staff profile. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ email }, { status: 201 });
}
