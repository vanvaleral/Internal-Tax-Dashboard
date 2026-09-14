import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server database access is not configured." }, { status: 503 });
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const [cases, announcements, clientDuplicates] = await Promise.all([
    admin.from("tax_cases").delete().lt("deleted_at", cutoff),
    admin.from("announcement_recipient_trash").delete().lt("deleted_at", cutoff),
    admin.from("client_master_duplicate_trash").delete().lt("deleted_at", cutoff)
  ]);
  const error = cases.error || announcements.error || clientDuplicates.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, purgedBefore: cutoff });
}
