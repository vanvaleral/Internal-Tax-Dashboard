import { NextRequest, NextResponse } from "next/server";
import { currentActor, isLeadership } from "@/lib/access";
import { createOperationalAnnouncement, notificationEventKey, uniqueProfileIds } from "@/lib/notifications";
import { calculateHimbauanDueDate } from "@/lib/operational-rules";

function canAccess(actor: any, client: any) {
  return isLeadership(actor.profile.role) || [client.tax_pic_profile_id, client.accounting_pic_profile_id].includes(actor.profile.id);
}

async function payloadFor(actor: any, input: Record<string, unknown>) {
  const clientId = String(input.clientId || "");
  if (!clientId) throw new Error("Choose a client before saving a case.");
  const { data: client, error } = await actor.admin.from("client_master").select("id, legal_name, tax_pic_name, accounting_pic_name, tax_pic_profile_id, accounting_pic_profile_id").eq("id", clientId).maybeSingle();
  if (error || !client) throw new Error(error?.message || "Client was not found.");
  if (!canAccess(actor, client)) throw new Error("You are not assigned to this client.");
  const category = input.caseCategory === "Pemeriksaan" ? "Pemeriksaan" : "Himbauan";
  const receivedDate = String(input.receivedDate || "");
  return {
    client_id: client.id, client_name: client.legal_name, case_type: String(input.caseType || "Tax Consultation").trim(), case_category: category,
    letter_number: String(input.letterNumber || "").trim() || null, letter_date: input.letterDate || null, received_date: receivedDate || null,
    subject: String(input.subject || "").trim() || null, tax_year: String(input.taxYear || "").trim() || null, inspector_pic: String(input.inspectorPic || "").trim() || null,
    sph_p_date: input.sphpDate || null, completion_date: input.completionDate || null, completion_notes: String(input.completionNotes || "").trim() || null,
    stage: String(input.stage || "Waiting Client Docs").trim(), priority: ["Low", "Medium", "High"].includes(String(input.priority)) ? input.priority : "Medium",
    tax_pic_name: client.tax_pic_name, accounting_pic_name: client.accounting_pic_name, tax_pic_profile_id: client.tax_pic_profile_id, accounting_pic_profile_id: client.accounting_pic_profile_id,
    due_date: category === "Himbauan" ? calculateHimbauanDueDate(receivedDate) || input.dueDate || null : null, notes: String(input.notes || "").trim() || null,
    next_steps: Array.isArray(input.nextSteps) ? input.nextSteps : [], closed_at: input.stage === "Closed" ? (input.closedAt || new Date().toISOString().slice(0, 10)) : null, created_by: actor.userId
  };
}

async function recipients(admin: any, payload: any) {
  const { data, error } = await admin.from("staff_profiles").select("id").in("role", ["leader", "supervisor", "partner", "admin"]);
  if (error) throw new Error(error.message);
  return uniqueProfileIds([payload.tax_pic_profile_id, payload.accounting_pic_profile_id, ...(data || []).map((profile: any) => profile.id)]);
}

export async function GET(request: NextRequest) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const includeDeleted = request.nextUrl.searchParams.get("deleted") === "1";
  let query = actor.admin.from("tax_cases").select("*").order("updated_at", { ascending: false });
  if (includeDeleted) {
    query = query.not("deleted_at", "is", null);
    if (!isLeadership(actor.profile.role)) query = query.eq("deleted_by_profile_id", actor.profile.id);
  } else {
    query = query.is("deleted_at", null);
    if (!isLeadership(actor.profile.role)) query = query.or(`tax_pic_profile_id.eq.${actor.profile.id},accounting_pic_profile_id.eq.${actor.profile.id}`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  try {
    const body = await request.json();
    const payload = await payloadFor(actor, body.case || body);
    const { data, error } = await actor.admin.from("tax_cases").insert(payload).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    try {
      await createOperationalAnnouncement({ title: `New ${payload.case_category}: ${payload.client_name}`, message: `${actor.profile.display_name || actor.profile.full_name} created a new ${payload.case_category} case.`, senderProfileId: actor.profile.id, recipientProfileIds: await recipients(actor.admin, payload), eventKey: notificationEventKey("case", data.id), sourceType: "tax_case", sourceId: data.id });
    } catch (notificationError) {
      // The case itself is durable even when notification delivery is retried later.
      console.error("[cases] notification failed", notificationError);
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save case." }, { status: 403 }); }
}

export async function PATCH(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Case id is required." }, { status: 400 });
  try {
    if (body.action === "restore") {
      let query = actor.admin.from("tax_cases").select("tax_pic_profile_id, accounting_pic_profile_id, deleted_by_profile_id").eq("id", id).not("deleted_at", "is", null);
      if (!isLeadership(actor.profile.role)) query = query.eq("deleted_by_profile_id", actor.profile.id);
      const { data: deletedCase, error: lookupError } = await query.maybeSingle();
      if (lookupError || !deletedCase) return NextResponse.json({ error: "This deleted case cannot be restored by your profile." }, { status: 403 });
      const { data, error } = await actor.admin.from("tax_cases").update({ deleted_at: null, deleted_by_profile_id: null }).eq("id", id).select("*").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data });
    }
    const payload = await payloadFor(actor, body.case || body);
    const { data: existing } = await actor.admin.from("tax_cases").select("tax_pic_profile_id, accounting_pic_profile_id").eq("id", id).maybeSingle();
    if (!existing || !canAccess(actor, existing)) return NextResponse.json({ error: "You are not assigned to this case." }, { status: 403 });
    const { created_by: _createdBy, ...update } = payload;
    const { data, error } = await actor.admin.from("tax_cases").update(update).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update case." }, { status: 403 }); }
}

export async function DELETE(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { id } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "Case id is required." }, { status: 400 });
  const { data: existing, error: lookupError } = await actor.admin
    .from("tax_cases")
    .select("tax_pic_profile_id, accounting_pic_profile_id")
    .eq("id", String(id))
    .is("deleted_at", null)
    .maybeSingle();
  if (lookupError || !existing || !canAccess(actor, existing)) return NextResponse.json({ error: "You are not allowed to delete this case." }, { status: 403 });
  const { error } = await actor.admin
    .from("tax_cases")
    .update({ deleted_at: new Date().toISOString(), deleted_by_profile_id: actor.profile.id })
    .eq("id", String(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
