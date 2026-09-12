import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const { username } = await request.json();
  const normalized = String(username || "").trim().toLowerCase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return NextResponse.json({ error: "Login service is not configured." }, { status: 503 });
  if (!/^[a-z0-9._-]{3,40}$/.test(normalized)) return NextResponse.json({ error: "Use a valid email or username." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error } = await admin
    .from("staff_profiles")
    .select("auth_user_id")
    .ilike("username", normalized)
    .maybeSingle();
  if (error?.code === "42703" || error?.code === "PGRST204") {
    return NextResponse.json({ error: "Username login is not ready yet. Please sign in with your email address." }, { status: 503 });
  }
  if (error || !profile?.auth_user_id) {
    return NextResponse.json({ error: "Username was not found. Use your email address or set a username from Profile." }, { status: 401 });
  }

  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(profile.auth_user_id);
  if (userError || !userResult.user?.email) return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  return NextResponse.json({ email: userResult.user.email }, { headers: { "Cache-Control": "no-store" } });
}
