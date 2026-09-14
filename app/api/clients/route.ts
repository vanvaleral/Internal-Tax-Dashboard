import { after, NextResponse } from "next/server";
import { currentActor, isLeadership } from "@/lib/access";
import { asSafeText, normalizeNpwp, validateClientImportRows } from "@/lib/client-import";
import { createOperationalAnnouncement, notificationEventKey } from "@/lib/notifications";

type ClientInput = Record<string, unknown>;
type StaffIds = { tax: string | null; accounting: string | null; partner: string | null; supervisor: string | null };

function redactFees<T extends Record<string, unknown>>(client: T): T {
  return Object.fromEntries(Object.entries(client).filter(([key]) => !["monthly_fee", "annual_fee", "fee_notes"].includes(key))) as T;
}

async function resolveStaffIds(admin: NonNullable<ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>>, rows: ClientInput[]) {
  const { data, error } = await admin.from("staff_profiles").select("id, full_name, display_name");
  if (error) throw new Error(error.message);
  const matches = new Map<string, string[]>();
  for (const profile of data || []) for (const label of [profile.display_name, profile.full_name]) {
    const key = asSafeText(label).toLowerCase();
    if (key) matches.set(key, [...(matches.get(key) || []), profile.id]);
  }
  const resolve = (value: unknown, field: string, row: number) => {
    const label = asSafeText(value);
    if (!label) return null;
    const ids = [...new Set(matches.get(label.toLowerCase()) || [])];
    if (ids.length !== 1) throw new Error(`Row ${row}: ${field} must match exactly one registered staff display name.`);
    return ids[0];
  };
  return rows.map((row, index): StaffIds => ({
    tax: resolve(row.taxPic, "PIC Tax", index + 2), accounting: resolve(row.accountingPic, "PIC Acc", index + 2),
    partner: resolve(row.partner, "Partner", index + 2), supervisor: resolve(row.supervisor, "Supervisor", index + 2)
  }));
}

function buildPayload(client: ClientInput, ids: StaffIds) {
  const obligations = client.obligations as Record<string, { status?: string }> | undefined;
  const obligation = (name: string) => Boolean(obligations?.[name]?.status !== "na");
  return {
    client_code: asSafeText(client.clientCode), legal_name: asSafeText(client.name), npwp: normalizeNpwp(client.npwp) || null,
    industry: asSafeText(client.industry) || null, address: asSafeText(client.address) || null,
    status: ["Active", "Inactive", "Proposal"].includes(asSafeText(client.clientStatus)) ? asSafeText(client.clientStatus) : "Active",
    tax_pic_name: asSafeText(client.taxPic) || null, accounting_pic_name: asSafeText(client.accountingPic) || null,
    tax_pic_profile_id: ids.tax, accounting_pic_profile_id: ids.accounting, partner_profile_id: ids.partner, supervisor_profile_id: ids.supervisor,
    monthly_fee: Number(client.serviceFee || client.monthlyFee || 0), annual_fee: Number(client.annualFee || 0),
    engagement_start: asSafeText(client.engagementStart) || null, engagement_end: asSafeText(client.engagementEnd) || null,
    contract_started_at: asSafeText(client.contractStartedAt || client.engagementStart) || null,
    inactivated_at: asSafeText(client.inactivatedAt) || null,
    tax_office_region: asSafeText(client.taxOfficeRegion) || null,
    notes: asSafeText(client.notes) || null, partner_name: asSafeText(client.partner) || null, supervisor_name: asSafeText(client.supervisor) || null,
    service_package: asSafeText(client.servicePackage) || null, proposal_status: asSafeText(client.proposalStatus) || null,
    company_form: asSafeText(client.businessForm) || null, has_pph21: obligation("pph21"), has_unifikasi: obligation("unifikasi"),
    has_pph25_pp55: obligation("pph25"), has_pb1: obligation("phrpb1"), has_ppn: obligation("ppn"), source_system: asSafeText(client.sourceSystem) || "manual"
  };
}

export async function GET(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 500), 1), 1000);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);
  let query = actor.admin.from("client_master").select("*", { count: "exact" }).order("legal_name").range(offset, offset + limit - 1);
  if (!isLeadership(actor.profile.role)) query = query.or(`tax_pic_profile_id.eq.${actor.profile.id},accounting_pic_profile_id.eq.${actor.profile.id}`);
  if (search) query = query.or(`legal_name.ilike.%${search}%,client_code.ilike.%${search}%,npwp.ilike.%${search}%`);
  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: isLeadership(actor.profile.role) ? data || [] : (data || []).map(redactFees), count, mode: "database", feeAccess: isLeadership(actor.profile.role) });
}

export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Only leadership can change the client master." }, { status: 403 });
  const body = await request.json();
  const rows: ClientInput[] = Array.isArray(body.clients) ? body.clients : [];
  if (!rows.length) return NextResponse.json({ error: "No clients supplied." }, { status: 400 });
  const validation = validateClientImportRows(rows);
  const rejected = validation.filter((entry) => entry.errors.length);
  if (body.operation === "validate-import") return NextResponse.json({ validation, valid: rows.length - rejected.length });
  if (rejected.length) return NextResponse.json({ error: "Import contains invalid rows.", validation }, { status: 422 });
  let ids: StaffIds[];
  try { ids = await resolveStaffIds(actor.admin, rows); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not validate PIC ownership." }, { status: 422 }); }
  const payload = rows.map((row, index) => buildPayload(row, ids[index]));
  const { data: existing, error: existingError } = await actor.admin.from("client_master").select("*").in("client_code", payload.map((row) => row.client_code));
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  const before = new Map((existing || []).map((client) => [client.client_code, client]));
  const { data, error } = await actor.admin.from("client_master").upsert(payload, { onConflict: "client_code" }).select("id, client_code, legal_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const activity = (data || []).map((client) => ({ client_id: client.id, action: before.has(client.client_code) ? "client_master_updated" : "client_master_created", previous_value: before.get(client.client_code) || null, new_value: payload.find((row) => row.client_code === client.client_code) || null, actor_user_id: actor.userId }));
  if (activity.length) {
    const { error: auditError } = await actor.admin.from("client_master_activity").insert(activity);
    if (auditError) console.error("[clients] client activity could not be written", auditError);
  }
  if (body.operation === "bulk-import") await actor.admin.from("client_import_batches").insert({ imported_by_profile_id: actor.profile.id, file_name: asSafeText(body.fileName) || null, file_sha256: asSafeText(body.fileSha256) || null, total_rows: rows.length, valid_rows: payload.length, created_count: payload.filter((row) => !before.has(row.client_code)).length, updated_count: payload.filter((row) => before.has(row.client_code)).length, rejected_rows: validation.filter((entry) => entry.errors.length), committed_at: new Date().toISOString() });
  const created = payload.filter((row) => !before.has(row.client_code));
  if (created.length) after(async () => {
    try { await createOperationalAnnouncement({ title: `New clients added: ${created.length}`, message: `${actor.profile.display_name || actor.profile.full_name} added ${created.slice(0, 3).map((client) => client.legal_name).join(", ")}${created.length > 3 ? ` and ${created.length - 3} more` : ""}.`, senderProfileId: actor.profile.id, eventKey: notificationEventKey("client-import", created.map((client) => client.client_code).sort().join(",")), sourceType: "client_master" }); }
    catch (error) { console.error("[clients] notification could not be created", error); }
  });
  return NextResponse.json({ data, mode: "database", imported: payload.length, created: created.length, updated: payload.length - created.length });
}
