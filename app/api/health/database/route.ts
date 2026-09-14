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

  const checkNames = ["client_master", "staff_profiles", "tax_cases", "my_work_tasks", "announcements", "notification_delivery_log"];
  const checks = await Promise.all([
    supabase.from("client_master").select("id").limit(1),
    supabase.from("staff_profiles").select("id").limit(1),
    supabase.from("tax_cases").select("id").limit(1),
    supabase.from("my_work_tasks").select("id").limit(1),
    supabase.from("announcements").select("id").limit(1),
    supabase.from("notification_delivery_log").select("id").limit(1)
  ]);
  const failed = checks.flatMap((result, index) => result.error ? [checkNames[index]] : []);

  if (failed.length) {
    return NextResponse.json(
      { configured: true, connected: false, mode: "database", message: `Database migration or health check needed: ${failed.join(", ")}.`, checks: { failed, checkedAt: new Date().toISOString() } },
      { status: 503 }
    );
  }

  return NextResponse.json({ configured: true, connected: true, mode: "database", message: "Database connection is ready.", checks: { failed: [], checkedAt: new Date().toISOString() } });
}
