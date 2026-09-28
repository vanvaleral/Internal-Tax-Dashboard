import { after, NextResponse } from "next/server";
import { canImportClientMaster, currentActor, isLeadership } from "@/lib/access";
import { asSafeText, normalizeClientIdentityName, normalizeImportedDate, normalizeNpwp, validateClientImportRows } from "@/lib/client-import";
import { createOperationalAnnouncement, notificationEventKey } from "@/lib/notifications";

type ClientInput = Record<string, unknown>;
type StaffIds = { tax: string | null; accounting: string | null; partner: string | null; supervisor: string | null };

function redactFees<T extends Record<string, unknown>>(client: T): T {
  return Object.fromEntries(Object.entries(client).filter(([key]) => !["monthly_fee", "annual_fee", "fee_notes"].includes(key))) as T;
}

async function resolveStaffIds(admin: NonNullable<ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>>, rows: ClientInput[]) {
  const { data, error } = await admin.from("staff_profiles").select("id, full_name, display_name").eq("directory_active", true);
  if (error) throw new Error(error.message);
  const matches = new Map<string, string[]>();
  for (const profile of data || []) for (const label of [profile.display_name, profile.full_name]) {
    const key = asSafeText(label).toLowerCase();
    if (key) matches.set(key, [...(matches.get(key) || []), profile.id]);
  }
  const issues = rows.map(() => [] as string[]);
  const resolve = (value: unknown, field: string, rowIndex: number) => {
    const label = asSafeText(value);
    if (!label) return null;
    const ids = [...new Set(matches.get(label.toLowerCase()) || [])];
    if (ids.length !== 1) {
      issues[rowIndex].push(`${field} must match exactly one active staff directory name.`);
      return null;
    }
    return ids[0];
  };
  const ids = rows.map((row, index): StaffIds => ({
    tax: resolve(row.taxPic, "PIC Tax", index), accounting: resolve(row.accountingPic, "PIC Acc", index),
    partner: resolve(row.partner, "Partner", index), supervisor: resolve(row.supervisor, "Supervisor", index)
  }));
  return { ids, issues };
}

async function addExistingClientDuplicateIssues(admin: NonNullable<ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>>, rows: ClientInput[], validation: ReturnType<typeof validateClientImportRows>) {
  const { data, error } = await admin.from("client_master").select("client_code, legal_name, npwp");
  if (error) throw new Error(error.message);
  const byCode = new Set((data || []).map((client) => asSafeText(client.client_code).toLowerCase()));
  const byIdentity = new Map<string, string[]>();
  for (const client of data || []) {
    const npwp = normalizeNpwp(client.npwp);
    const name = normalizeClientIdentityName(client.legal_name);
    const key = npwp.length >= 15 ? `npwp:${npwp}` : name ? `name:${name}` : "";
    if (key) byIdentity.set(key, [...(byIdentity.get(key) || []), asSafeText(client.client_code)]);
  }
  rows.forEach((row, index) => {
    const code = asSafeText(row.clientCode).toLowerCase();
    if (byCode.has(code)) return; // Same code is an intentional update.
    const npwp = normalizeNpwp(row.npwp);
    const name = normalizeClientIdentityName(row.name);
    const key = npwp.length >= 15 ? `npwp:${npwp}` : name ? `name:${name}` : "";
    const matches = key ? byIdentity.get(key) || [] : [];
    if (matches.length) validation[index].errors.push(`Possible duplicate of existing client code(s): ${matches.join(", ")}. Use the existing code to update it, or resolve the duplicate first.`);
  });
}

function buildPayload(client: ClientInput, ids: StaffIds) {
  const obligations = client.obligations as Record<string, { status?: string }> | undefined;
  const obligation = (name: string) => Boolean(obligations?.[name]?.status !== "na");
  return {
    client_code: asSafeText(client.clientCode), legal_name: asSafeText(client.name), npwp: normalizeNpwp(client.npwp) || null,
    industry: asSafeText(client.industry) || null, address: asSafeText(client.address) || null,
    status: ["Active", "Inactive", "Proposal", "Contract"].includes(asSafeText(client.clientStatus)) ? asSafeText(client.clientStatus) : "Active",
    tax_pic_name: asSafeText(client.taxPic) || null, accounting_pic_name: asSafeText(client.accountingPic) || null,
    tax_pic_profile_id: ids.tax, accounting_pic_profile_id: ids.accounting, partner_profile_id: ids.partner, supervisor_profile_id: ids.supervisor,
    monthly_fee: Number(client.serviceFee || client.monthlyFee || 0), annual_fee: Number(client.annualFee || 0),
    engagement_start: normalizeImportedDate(client.engagementStart), engagement_end: normalizeImportedDate(client.engagementEnd),
    contract_started_at: normalizeImportedDate(client.contractStartedAt || client.engagementStart),
    contract_signed_at: normalizeImportedDate(client.contractSignedAt),
    inactivated_at: normalizeImportedDate(client.inactivatedAt),
    tax_office_region: asSafeText(client.taxOfficeRegion) || null,
    notes: asSafeText(client.notes) || null, partner_name: asSafeText(client.partner) || null, supervisor_name: asSafeText(client.supervisor) || null,
    service_package: asSafeText(client.servicePackage) || null, proposal_status: asSafeText(client.proposalStatus) || null,
    responsible_person_name: asSafeText(client.responsiblePersonName) || null,
    responsible_person_birth_place: asSafeText(client.responsiblePersonBirthPlace) || null,
    responsible_person_birth_date: normalizeImportedDate(client.responsiblePersonBirthDate),
    responsible_person_address: asSafeText(client.responsiblePersonAddress) || null,
    notary_name: asSafeText(client.notaryName) || null, notary_address: asSafeText(client.notaryAddress) || null,
    deed_number: asSafeText(client.deedNumber) || null, deed_date: normalizeImportedDate(client.deedDate),
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
  if (["bulk-import", "validate-import"].includes(body.operation) && !canImportClientMaster(actor.profile.role)) {
    return NextResponse.json({ error: "Only a Supervisor or Leader can import the client master." }, { status: 403 });
  }
  const validation = validateClientImportRows(rows);
  let ownership: Awaited<ReturnType<typeof resolveStaffIds>>;
  try { ownership = await resolveStaffIds(actor.admin, rows); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not validate PIC ownership." }, { status: 422 }); }
  ownership.issues.forEach((issues, index) => validation[index].errors.push(...issues));
  if (["bulk-import", "validate-import"].includes(body.operation)) {
    try { await addExistingClientDuplicateIssues(actor.admin, rows, validation); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not check existing client duplicates." }, { status: 500 }); }
  }
  const rejected = validation.filter((entry) => entry.errors.length);
  if (body.operation === "validate-import") {
    const codes = validation.filter((entry) => entry.clientCode).map((entry) => entry.clientCode);
    const { data: existing, error } = codes.length ? await actor.admin.from("client_master").select("client_code").in("client_code", codes) : { data: [], error: null };
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const existingCodes = new Set((existing || []).map((client) => client.client_code));
    const validRows = validation.filter((entry) => !entry.errors.length);
    return NextResponse.json({ validation, valid: validRows.length, summary: { total: rows.length, invalid: rejected.length, created: validRows.filter((entry) => !existingCodes.has(entry.clientCode)).length, updated: validRows.filter((entry) => existingCodes.has(entry.clientCode)).length } });
  }
  if (rejected.length) return NextResponse.json({ error: "Import contains invalid rows.", validation }, { status: 422 });
  const payload = rows.map((row, index) => buildPayload(row, ownership.ids[index]));
  const { data: committed, error } = await actor.admin.rpc("commit_client_master_import", {
    p_rows: payload,
    p_actor_user_id: actor.userId,
    p_actor_profile_id: actor.profile.id,
    p_operation: body.operation === "bulk-import" ? "bulk-import" : "save",
    p_file_name: asSafeText(body.fileName) || null,
    p_file_sha256: asSafeText(body.fileSha256) || null
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const data = Array.isArray(committed?.data) ? committed.data : [];
  const createdCount = Number(committed?.created || 0);
  if (createdCount) after(async () => {
    try { await createOperationalAnnouncement({ title: `New clients added: ${createdCount}`, message: `${actor.profile.display_name || actor.profile.full_name} added ${createdCount} client(s).`, senderProfileId: actor.profile.id, eventKey: notificationEventKey("client-import", data.map((client: { client_code: string }) => client.client_code).sort().join(",")), sourceType: "client_master" }); }
    catch (error) { console.error("[clients] notification could not be created", error); }
  });
  return NextResponse.json({ data, mode: "database", imported: payload.length, created: createdCount, updated: Number(committed?.updated || 0) });
}
