import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function isMissingDisplayNameError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || error?.code === "PGRST204" || /display_name.*schema cache/i.test(error?.message || "");
}

export async function GET() {
  const sessionClient = await createClient();
  if (!sessionClient) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Staff directory is not configured." }, { status: 503 });

  const adminClient = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let { data, error } = await adminClient
    .from("staff_profiles")
    .select("id, full_name, display_name, team_division, role")
    .order("display_name");

  if (isMissingDisplayNameError(error)) {
    const legacy = await adminClient
      .from("staff_profiles")
      .select("id, full_name, team_division, role")
      .order("full_name");
    data = legacy.data ? legacy.data.map((item) => ({ ...item, display_name: item.full_name })) : null;
    error = legacy.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff: data || [] });
}
