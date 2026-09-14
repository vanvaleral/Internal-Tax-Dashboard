import { createAdminClient } from "@/lib/supabase/admin";
import { notificationEventKey, uniqueProfileIds } from "@/lib/operational-rules";

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

async function retryDatabaseOperation<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let latestError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      latestError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw latestError instanceof Error ? latestError : new Error("Notification delivery could not be completed.");
}

async function recipientsForAudience(admin: AdminClient, audience: Audience) {
  let query = admin.from("staff_profiles").select("id");
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
  let announcementId = "";
  let created = false;

  await retryDatabaseOperation(async () => {
    const { data, error } = await admin
      .from("announcements")
      .insert({
        title: input.title.trim(),
        message: input.message.trim(),
        audience,
        sender_profile_id: input.senderProfileId,
        event_key: eventKey,
        source_type: input.sourceType || null,
        source_id: input.sourceId || null
      })
      .select("id")
      .maybeSingle();

    if (!error && data?.id) {
      announcementId = data.id;
      created = true;
      return;
    }

    // A timed-out retry may reach an event already stored by the prior request.
    if (eventKey && error?.code === "23505") {
      const { data: existing, error: lookupError } = await admin
        .from("announcements")
        .select("id")
        .eq("sender_profile_id", input.senderProfileId)
        .eq("event_key", eventKey)
        .maybeSingle();
      if (lookupError || !existing?.id) throw new Error(lookupError?.message || "Could not recover the notification event.");
      announcementId = existing.id;
      return;
    }
    throw new Error(error?.message || "Could not create announcement.");
  });

  const recipientIds = uniqueProfileIds(input.recipientProfileIds || []);
  const resolvedRecipients = recipientIds.length ? recipientIds : await retryDatabaseOperation(() => recipientsForAudience(admin, audience));
  if (!resolvedRecipients.length) throw new Error("No active notification recipients were found.");

  await retryDatabaseOperation(async () => {
    const rows = resolvedRecipients.map((staffProfileId) => ({ announcement_id: announcementId, staff_profile_id: staffProfileId }));
    const { error } = await admin.from("announcement_recipients").upsert(rows, { onConflict: "announcement_id,staff_profile_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  });

  // Telemetry is useful, but a legacy database without the new table must not
  // turn a successfully delivered inbox item into a failed user action.
  await admin.from("notification_delivery_log").upsert(
    resolvedRecipients.map((staffProfileId) => ({
      announcement_id: announcementId,
      staff_profile_id: staffProfileId,
      channel: "in_app",
      status: "delivered",
      attempts: 1,
      delivered_at: new Date().toISOString()
    })),
    { onConflict: "announcement_id,staff_profile_id,channel", ignoreDuplicates: true }
  );

  return { id: announcementId, created, recipientCount: resolvedRecipients.length };
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
