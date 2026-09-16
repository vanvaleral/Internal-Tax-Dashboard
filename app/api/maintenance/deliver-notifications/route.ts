import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Notification service is not configured." }, { status: 503 });
  const now = new Date().toISOString();
  const { data: jobs, error } = await admin.from("notification_delivery_log")
    .select("id, announcement_id, staff_profile_id, attempts, max_attempts")
    .in("status", ["queued", "failed"]).is("completed_at", null).lte("next_attempt_at", now).order("id").limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let delivered = 0;
  let failed = 0;
  for (const job of jobs || []) {
    const { data: active } = await admin.from("staff_profiles").select("id").eq("id", job.staff_profile_id).eq("directory_active", true).maybeSingle();
    const deliveryError = active
      ? (await admin.from("announcement_recipients").upsert({ announcement_id: job.announcement_id, staff_profile_id: job.staff_profile_id }, { onConflict: "announcement_id,staff_profile_id", ignoreDuplicates: true })).error
      : { message: "Recipient profile is inactive." };
    if (!deliveryError) {
      delivered += 1;
      await admin.from("notification_delivery_log").update({ status: "delivered", delivered_at: now, completed_at: now, last_error: null }).eq("id", job.id);
      continue;
    }
    failed += 1;
    const attempts = Number(job.attempts || 0) + 1;
    const exhausted = attempts >= Number(job.max_attempts || 8);
    const nextAttempt = new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString();
    await admin.from("notification_delivery_log").update({ status: "failed", attempts, last_error: deliveryError.message, next_attempt_at: nextAttempt, completed_at: exhausted ? now : null }).eq("id", job.id);
  }
  return NextResponse.json({ ok: true, processed: (jobs || []).length, delivered, failed });
}
