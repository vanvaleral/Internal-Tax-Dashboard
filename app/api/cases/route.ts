import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOperationalAnnouncement, notificationEventKey, resolveProfileIdsByNames, uniqueProfileIds } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateHimbauanDueDate } from "@/lib/operational-rules";

function casePayload(input: Record<string, unknown>, userId: string) {
  const stage = String(input.stage || "Waiting Client Docs").trim();
  const category = input.caseCategory === "Pemeriksaan" ? "Pemeriksaan" : "Himbauan";
  const receivedDate = String(input.receivedDate || "");
  const dueDate = category === "Himbauan" ? calculateHimbauanDueDate(receivedDate) : null;
  return {
    client_id: input.clientId || null,
    client_name: String(input.clientName || "").trim(),
    case_type: String(input.caseType || "Tax Consultation").trim(),
    case_category: category,
    letter_number: String(input.letterNumber || "").trim() || null,
    letter_date: input.letterDate || null,
    received_date: receivedDate || null,
    subject: String(input.subject || "").trim() || null,
    tax_year: String(input.taxYear || "").trim() || null,
    inspector_pic: String(input.inspectorPic || "").trim() || null,
    sph_p_date: input.sphpDate || null,
    completion_date: input.completionDate || null,
    completion_notes: String(input.completionNotes || "").trim() || null,
    stage,
    priority: ["Low", "Medium", "High"].includes(String(input.priority)) ? input.priority : "Medium",
    tax_pic_name: String(input.taxPic || "").trim() || null,
    accounting_pic_name: String(input.accountingPic || "").trim() || null,
    due_date: dueDate || (input.dueDate || null),
    notes: String(input.notes || "").trim() || null,
    next_steps: Array.isArray(input.nextSteps) ? input.nextSteps : [],
    closed_at: stage === "Closed" ? (input.closedAt || new Date().toISOString().slice(0, 10)) : null,
    created_by: userId
  };
}

async function caseNotificationRecipientIds(payload: ReturnType<typeof casePayload>) {
  const admin = createAdminClient();
  if (!admin) return [];
  const names = [payload.tax_pic_name, payload.accounting_pic_name];
  if (payload.client_id) {
    const { data: client } = await admin
      .from("client_master")
      .select("tax_pic_name, accounting_pic_name, partner_name, supervisor_name")
      .eq("id", payload.client_id)
      .maybeSingle();
    if (client) names.push(client.tax_pic_name, client.accounting_pic_name, client.partner_name, client.supervisor_name);
  }
  const directIds = await resolveProfileIdsByNames(admin, names);
  const { data: leadership, error } = await admin
    .from("staff_profiles")
    .select("id")
    .in("role", ["leader", "supervisor", "partner", "admin"]);
  if (error) throw new Error(error.message);
  return uniqueProfileIds([...directIds, ...(leadership || []).map((profile) => profile.id)]);
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  const { data, error } = await supabase.from("tax_cases").select("*").order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  const body = await request.json();
  const payload = casePayload(body.case || body, user.id);
  if (!payload.client_name) return NextResponse.json({ error: "Client name is required." }, { status: 400 });
  const { data, error } = await supabase.from("tax_cases").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Notification creation performs several extra queries. It must not delay a
  // successful case save until the Vercel request reaches its timeout limit.
  after(async () => {
    try {
      const { data: creator } = await supabase.from("staff_profiles").select("id, display_name, full_name").eq("auth_user_id", user.id).maybeSingle();
      if (creator) await createOperationalAnnouncement({
        title: `New ${payload.case_category}: ${payload.client_name}`,
        message: `${creator.display_name || creator.full_name} created a new ${payload.case_category} case.`,
        senderProfileId: creator.id,
        recipientProfileIds: await caseNotificationRecipientIds(payload),
        eventKey: notificationEventKey("case", data.id),
        sourceType: "tax_case",
        sourceId: data.id
      });
    } catch (notificationError) {
      console.error("[cases] notification could not be created", notificationError);
    }
  });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Case id is required." }, { status: 400 });
  const { created_by: _createdBy, ...payload } = casePayload(body.case || body, user.id);
  const { data, error } = await supabase.from("tax_cases").update(payload).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
