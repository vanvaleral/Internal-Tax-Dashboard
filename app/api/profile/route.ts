import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const profileFields = "id, full_name, display_name, username, team_division, role, auth_user_id";

async function authenticatedUser() {
  const session = await createClient();
  if (!session) return { error: "Database is not configured.", status: 503 as const };
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: "Authentication is required.", status: 401 as const };
  const admin = createAdminClient();
  if (!admin) return { error: "Server database access is not configured.", status: 503 as const };
  return { user, admin };
}

export async function GET() {
  const context = await authenticatedUser();
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const { data, error } = await context.admin.from("staff_profiles").select(profileFields).eq("auth_user_id", context.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ user: { id: context.user.id, email: context.user.email }, profile: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await authenticatedUser();
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await request.json();
  const fullName = String(body.fullName || "").trim();
  const displayName = String(body.displayName || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  if (fullName.length < 2 && displayName.length < 2) return NextResponse.json({ error: "Display name must contain at least 2 characters." }, { status: 400 });
  if (username && !/^[a-z0-9._-]{3,40}$/.test(username)) return NextResponse.json({ error: "Username must use 3-40 lowercase letters, numbers, dots, dashes, or underscores." }, { status: 400 });

  const { data: existing, error: existingError } = await context.admin.from("staff_profiles").select(profileFields).eq("auth_user_id", context.user.id).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  const result = existing
    ? await context.admin.from("staff_profiles").update({ display_name: displayName || existing.display_name || existing.full_name, ...(username ? { username } : {}) }).eq("auth_user_id", context.user.id).select(profileFields).single()
    : await context.admin.from("staff_profiles").insert({ auth_user_id: context.user.id, full_name: fullName || displayName, display_name: displayName || fullName, username: username || undefined, team_division: "Tax Team", role: "staff" }).select(profileFields).single();
  const { data, error } = result;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
