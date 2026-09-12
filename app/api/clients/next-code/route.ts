import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  const { data, error } = await supabase.rpc("allocate_client_code");
  if (error || !data) return NextResponse.json({ error: error?.message || "Could not allocate a client code." }, { status: 500 });
  return NextResponse.json({ clientCode: data });
}
