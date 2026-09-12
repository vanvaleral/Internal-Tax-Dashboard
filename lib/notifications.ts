import { createAdminClient } from "@/lib/supabase/admin";

export async function createOperationalAnnouncement(input: { title: string; message: string; senderProfileId: string; recipientNames?: string[] }) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: announcement } = await admin.from("announcements").insert({ title: input.title, message: input.message, audience: "all", sender_profile_id: input.senderProfileId }).select("id").single();
  if (!announcement) return;
  let query = admin.from("staff_profiles").select("id, full_name, display_name");
  const { data: staff } = await query;
  const wanted = new Set((input.recipientNames || []).map((name) => name.toLowerCase()).filter(Boolean));
  const recipients = wanted.size ? (staff || []).filter((item) => wanted.has(String(item.display_name || item.full_name).toLowerCase())) : (staff || []);
  if (recipients.length) await admin.from("announcement_recipients").insert(recipients.map((item) => ({ announcement_id: announcement.id, staff_profile_id: item.id })));
}
