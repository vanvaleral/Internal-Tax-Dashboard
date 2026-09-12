import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const body = await request.json();
  const password = String(body.password || "");
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must contain at least 8 characters." }, { status: 400 });
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
