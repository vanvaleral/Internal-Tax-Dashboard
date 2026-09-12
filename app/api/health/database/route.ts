import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = createAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { configured: false, connected: false, mode: "demo", message: "Supabase environment variables are not configured." },
      { status: 200 }
    );
  }

  const { error } = await supabase.from("client_master").select("id").limit(1);

  if (error) {
    return NextResponse.json(
      { configured: true, connected: false, mode: "database", message: error.message },
      { status: 503 }
    );
  }

  return NextResponse.json({ configured: true, connected: true, mode: "database", message: "Database connection is ready." });
}
