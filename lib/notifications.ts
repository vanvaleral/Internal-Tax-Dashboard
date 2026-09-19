import { createAdminClient } from "@/lib/supabase/admin";
import { notificationEventKey, uniqueProfileIds } from "@/lib/operational-rules";
import webpush from "web-push";

export { notificationEventKey, uniqueProfileIds } from "@/lib/operational-rules";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type Audience = "all" | "tax" | "accounting";

export type OperationalAnnouncementInput = {
  title: string;
  message: string;
  senderProfileId: string;
  recipientProfileIds?: string[];
  audience?: Audience;
  /** A stable source event ID makes retries safe and prevents duplicate inbox items. */
  eventKey?: string;
  sourceType?: string;
  sourceId?: string;
};

async function recipientsForAudience(admin: AdminClient, audience: Audience) {
  let query = admin.from("staff_profiles").select("id").eq("directory_active", true);
  if (audience === "tax") query = query.eq("team_division", "Tax Team");
  if (audience === "accounting") query = query.eq("team_division", "Accounting Team");
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return uniqueProfileIds((data || []).map((profile) => profile.id));
}

/**
 * Creates the inbox record and its recipients as one retry-safe operational action.
 * Recipient IDs, rather than display names, remain the authoritative delivery target.
 */
export async function createOperationalAnnouncement(input: OperationalAnnouncementInput) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Announcement service is not configured.");

  const audience: Audience = input.audience === "tax" || input.audience === "accounting" ? input.audience : "all";
  const eventKey = String(input.eventKey || "").trim() || null;
  const requestedIds = uniqueProfileIds(input.recipientProfileIds || []);
  let resolvedRecipients = requestedIds.length ? requestedIds : await recipientsForAudience(admin, audience);
  if (requestedIds.length) {
    const { data, error } = await admin.from("staff_profiles").select("id").in("id", requestedIds).eq("directory_active", true);
    if (error) throw new Error(error.message);
    resolvedRecipients = uniqueProfileIds((data || []).map((profile) => profile.id));
  }
  if (!resolvedRecipients.length) throw new Error("No active notification recipients were found.");
  const { data: queued, error: outboxError } = await admin.rpc("enqueue_operational_announcement", {
    p_title: input.title.trim(), p_message: input.message.trim(), p_audience: audience,
    p_sender_profile_id: input.senderProfileId, p_event_key: eventKey || "",
    p_source_type: input.sourceType || "", p_source_id: input.sourceId || "",
    p_recipient_profile_ids: resolvedRecipients
  });
  if (outboxError || !queued?.id) throw new Error(outboxError?.message || "Announcement could not be queued.");
  const announcementId = String(queued.id);

  // One immediate idempotent attempt keeps the inbox responsive. Any failure
  // remains durable in the outbox and is retried by the maintenance worker.
  const { error: immediateError } = await admin.from("announcement_recipients").upsert(
    resolvedRecipients.map((staffProfileId) => ({ announcement_id: announcementId, staff_profile_id: staffProfileId })),
    { onConflict: "announcement_id,staff_profile_id", ignoreDuplicates: true }
  );
  if (!immediateError) {
    await admin.from("notification_delivery_log").update({ status: "delivered", delivered_at: new Date().toISOString(), completed_at: new Date().toISOString(), last_error: null })
      .eq("announcement_id", announcementId).in("staff_profile_id", resolvedRecipients).eq("channel", "in_app");
  } else {
    await admin.from("notification_delivery_log").update({ status: "failed", last_error: immediateError.message })
      .eq("announcement_id", announcementId).in("staff_profile_id", resolvedRecipients).eq("channel", "in_app");
  }

  // Queue Web Push only for users who enabled it on at least one device.
  // Failure here must never prevent the durable in-app announcement.
  const { data: pushSubscriptions } = await admin.from("web_push_subscriptions").select("id, staff_profile_id, endpoint, p256dh, auth").in("staff_profile_id", resolvedRecipients);
  const pushRecipientIds = uniqueProfileIds((pushSubscriptions || []).map((row) => row.staff_profile_id));
  if (pushRecipientIds.length) {
    await admin.from("notification_delivery_log").upsert(
      pushRecipientIds.map((staffProfileId) => ({ announcement_id: announcementId, staff_profile_id: staffProfileId, channel: "web_push", status: "queued", attempts: 1, next_attempt_at: new Date().toISOString() })),
      { onConflict: "announcement_id,staff_profile_id,channel", ignoreDuplicates: true }
    );
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (publicKey && privateKey) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@lmatsconsulting.com", publicKey, privateKey);
      await Promise.all(pushRecipientIds.map(async (staffProfileId) => {
        const subscriptions = (pushSubscriptions || []).filter((row) => row.staff_profile_id === staffProfileId);
        const results = await Promise.allSettled(subscriptions.map((subscription) => webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth }
        }, JSON.stringify({ title: input.title, body: "Open the dashboard to read this announcement.", tag: `announcement-${announcementId}`, url: "/demo.html?view=announcement-view" }))));
        const expiredIds = results.flatMap((result, index) => result.status === "rejected" && [404, 410].includes(Number((result.reason as any)?.statusCode)) ? [subscriptions[index].id] : []);
        if (expiredIds.length) await admin.from("web_push_subscriptions").delete().in("id", expiredIds);
        const delivered = results.some((result) => result.status === "fulfilled");
        await admin.from("notification_delivery_log").update(delivered
          ? { status: "delivered", delivered_at: new Date().toISOString(), completed_at: new Date().toISOString(), last_error: null }
          : { status: "failed", last_error: "All immediate browser push deliveries failed.", next_attempt_at: new Date(Date.now() + 120_000).toISOString() })
          .eq("announcement_id", announcementId).eq("staff_profile_id", staffProfileId).eq("channel", "web_push");
      }));
    }
  }

  return { id: announcementId, created: Boolean(queued.created), recipientCount: Number(queued.recipientCount || resolvedRecipients.length), queued: Boolean(immediateError) };
}

/** Compatibility bridge while older client/case records still store PIC names. */
export async function resolveProfileIdsByNames(admin: AdminClient, names: Array<string | null | undefined>) {
  const wanted = new Set(names.map((name) => String(name || "").trim().toLowerCase()).filter(Boolean));
  if (!wanted.size) return [];
  const { data, error } = await admin.from("staff_profiles").select("id, display_name, full_name");
  if (error) throw new Error(error.message);
  return uniqueProfileIds((data || [])
    .filter((profile) => wanted.has(String(profile.display_name || profile.full_name || "").trim().toLowerCase()))
    .map((profile) => profile.id));
}
