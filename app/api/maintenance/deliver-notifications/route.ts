import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import webpush from "web-push";
import { notificationDestination, webPushConfiguration } from "@/lib/web-push";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || token.length > 200) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Notification service is not configured." }, { status: 503 });
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    const { data: allowed, error: authError } = await admin.rpc("authorize_notification_scheduler", { p_token: token });
    if (authError || allowed !== true) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date().toISOString();
  const { data: jobs, error } = await admin.rpc("claim_notification_deliveries", { p_limit: 10 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let delivered = 0;
  let failed = 0;
  const deliverJob = async (job: { id: number; announcement_id: string; staff_profile_id: string; channel: string; attempts: number; max_attempts: number }) => {
    const { data: active } = await admin.from("staff_profiles").select("id").eq("id", job.staff_profile_id).eq("directory_active", true).maybeSingle();
    let deliveryError: { message: string } | null = active ? null : { message: "Recipient profile is inactive." };
    if (!deliveryError && job.channel === "web_push") {
      const configuration = webPushConfiguration();
      if (!configuration.configured) deliveryError = { message: configuration.message };
      else {
        const [{ data: announcement, error: announcementError }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
          admin.from("announcements").select("title, message, source_type, source_id").eq("id", job.announcement_id).maybeSingle(),
          admin.from("web_push_subscriptions").select("id, endpoint, p256dh, auth").eq("staff_profile_id", job.staff_profile_id)
        ]);
        deliveryError = announcementError || subscriptionError;
        if (!deliveryError && (!announcement || !subscriptions?.length)) deliveryError = { message: "No active browser subscription was found." };
        if (!deliveryError) {
          const pushAnnouncement = announcement!;
          const results = await Promise.allSettled((subscriptions || []).map((subscription) => webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
          }, JSON.stringify({ title: pushAnnouncement.title, body: "Open the dashboard to read this notification.", tag: `announcement-${job.announcement_id}`, url: notificationDestination(pushAnnouncement.source_type, pushAnnouncement.source_id) }), { timeout: 10_000 })));
          const expiredIds = results.flatMap((result, index) => result.status === "rejected" && [404, 410].includes(Number((result.reason as any)?.statusCode)) ? [subscriptions![index].id] : []);
          if (expiredIds.length) await admin.from("web_push_subscriptions").delete().in("id", expiredIds);
          if (!results.some((result) => result.status === "fulfilled")) deliveryError = { message: "All browser push deliveries failed." };
        }
      }
    } else if (!deliveryError) {
      deliveryError = (await admin.from("announcement_recipients").upsert({ announcement_id: job.announcement_id, staff_profile_id: job.staff_profile_id }, { onConflict: "announcement_id,staff_profile_id", ignoreDuplicates: true })).error;
    }
    if (!deliveryError) {
      delivered += 1;
      await admin.from("notification_delivery_log").update({ status: "delivered", delivered_at: now, completed_at: now, last_error: null }).eq("id", job.id);
      return;
    }
    failed += 1;
    const attempts = Number(job.attempts || 1);
    const exhausted = attempts >= Number(job.max_attempts || 8);
    const nextAttempt = new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString();
    await admin.from("notification_delivery_log").update({ status: "failed", attempts, last_error: deliveryError.message, next_attempt_at: nextAttempt, completed_at: exhausted ? now : null }).eq("id", job.id);
  };
  let cursor = 0;
  const pending = jobs || [];
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
    while (cursor < pending.length) await deliverJob(pending[cursor++]);
  }));
  return NextResponse.json({ ok: true, processed: (jobs || []).length, delivered, failed });
}
