import { NextResponse } from "next/server";
import { currentActor, isLeadership } from "@/lib/access";

const scopes = new Set(["monthly_compliance", "annual_accounting", "annual_tax"]);

function clientIdentifier(row: Record<string, unknown>) {
  return String(row.databaseId || row.clientId || row.client_id || row.clientCode || row.clientName || row.name || "").trim();
}

function filterPayload(payload: unknown, allowed: Set<string>, leadership: boolean) {
  if (leadership || !payload || typeof payload !== "object") return payload;
  const value = payload as Record<string, unknown>;
  const filterRows = (rows: unknown) => Array.isArray(rows)
    ? rows.filter((row) => row && typeof row === "object" && allowed.has(clientIdentifier(row as Record<string, unknown>)))
    : rows;
  if (Array.isArray(value)) return filterRows(value);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, filterRows(item)]));
}

function monthlyRowOwnerIds(row: Record<string, unknown>) {
  return [
    row.taxPicProfileId, row.accountingPicProfileId,
    row.tax_pic_profile_id, row.accounting_pic_profile_id,
    row.taxPicSnapshotProfileId, row.accountingPicSnapshotProfileId
  ].map((id) => String(id || "").trim()).filter(Boolean);
}

function canAccessMonthlyRow(row: Record<string, unknown>, profileId: string, legacyAllowed: Set<string>) {
  const snapshotOwners = monthlyRowOwnerIds(row);
  return snapshotOwners.length
    ? snapshotOwners.includes(profileId)
    : legacyAllowed.has(clientIdentifier(row));
}

function filterMonthlyPayload(payload: unknown, profileId: string, legacyAllowed: Set<string>) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return Object.fromEntries(Object.entries(payload as Record<string, unknown>).map(([period, rows]) => [
    period,
    Array.isArray(rows)
      ? rows.filter((row) => row && typeof row === "object" && canAccessMonthlyRow(row as Record<string, unknown>, profileId, legacyAllowed))
      : rows
  ]));
}

function mergeMonthlyPayload(currentPayload: unknown, incomingPayload: unknown, allowed: Set<string> | null, profileId?: string) {
  const current = currentPayload && typeof currentPayload === "object" && !Array.isArray(currentPayload) ? currentPayload as Record<string, unknown> : {};
  const incoming = incomingPayload && typeof incomingPayload === "object" && !Array.isArray(incomingPayload) ? incomingPayload as Record<string, unknown> : {};
  const merged: Record<string, unknown> = { ...current };
  for (const [period, rows] of Object.entries(incoming)) {
    if (!Array.isArray(rows)) continue;
    if (!allowed) {
      merged[period] = rows;
      continue;
    }
    const incomingRows = rows.filter((row) => row && typeof row === "object" && canAccessMonthlyRow(row as Record<string, unknown>, profileId || "", allowed));
    const existingRows = Array.isArray(current[period]) ? current[period] : [];
    const retainedRows = existingRows.filter((row) => !row || typeof row !== "object" || !canAccessMonthlyRow(row as Record<string, unknown>, profileId || "", allowed));
    merged[period] = [...retainedRows, ...incomingRows];
  }
  return merged;
}

function periodDetails(value: unknown) {
  const match = String(value || "").match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  return {
    key: new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" }) + ` ${year}`,
    month: new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" }),
    year
  };
}

function monthlySnapshotRow(client: Record<string, any>, period: NonNullable<ReturnType<typeof periodDetails>>, actor: { id: string; full_name: string; display_name: string | null }) {
  const enabled = (value: unknown) => value ? {
    status: "awaiting", receiptNumber: "", revisionRequired: false, quickNotes: "", payableAmount: 0,
    taxBreakdown: "", billingCode: "", kapkjs: "", expirationDate: "", paymentDate: "", ntpn: "", reported: false
  } : { status: "na", receiptNumber: "", revisionRequired: false, quickNotes: "", payableAmount: 0, taxBreakdown: "", billingCode: "", kapkjs: "", expirationDate: "", paymentDate: "", ntpn: "", reported: false };
  const code = String(client.client_code || "");
  const generatedAt = new Date().toISOString();
  return {
    id: /^CL-\d+$/i.test(code) ? `client-${code.slice(3)}` : `client-db-${client.id}`,
    databaseId: client.id,
    clientCode: code,
    name: client.legal_name || "",
    businessForm: client.company_form || "",
    npwp: client.npwp || "",
    industry: client.industry || "Other",
    address: client.address || "",
    clientStatus: client.status || "Active",
    taxPic: client.tax_pic_name || "",
    accountingPic: client.accounting_pic_name || "",
    partner: client.partner_name || "",
    supervisor: client.supervisor_name || "",
    taxPicProfileId: client.tax_pic_profile_id || null,
    accountingPicProfileId: client.accounting_pic_profile_id || null,
    taxPicSnapshot: client.tax_pic_name || "",
    accountingPicSnapshot: client.accounting_pic_name || "",
    taxPicSnapshotProfileId: client.tax_pic_profile_id || null,
    accountingPicSnapshotProfileId: client.accounting_pic_profile_id || null,
    generatedByProfileId: actor.id,
    generatedByName: actor.display_name || actor.full_name,
    generatedAt,
    servicePackage: client.service_package || "Monthly + Annual",
    engagementStart: client.engagement_start || "",
    engagementEnd: client.engagement_end || "",
    contractStartedAt: client.contract_started_at || "",
    taxOfficeRegion: client.tax_office_region || "Lainnya",
    notes: client.notes || "",
    serviceFee: Number(client.monthly_fee || 0),
    annualFee: Number(client.annual_fee || 0),
    month: period.month,
    year: period.year,
    dataState: "missing",
    followUpCount: 0,
    claimStatus: "Draft",
    paymentStatus: "Not Started",
    billingUploaded: false,
    lastUpdated: "",
    obligations: {
      pph21: enabled(client.has_pph21), unifikasi: enabled(client.has_unifikasi), pph25: enabled(client.has_pph25_pp55),
      phrpb1: enabled(client.has_pb1), ppn: enabled(client.has_ppn)
    }
  };
}

export async function GET(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const scope = new URL(request.url).searchParams.get("scope");
  let query = actor.admin.from("operational_workspace_state").select("scope, payload, version, updated_at");
  if (scope && scopes.has(scope)) query = query.eq("scope", scope);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (isLeadership(actor.profile.role)) return NextResponse.json({ data: data || [] });
  const { data: clients, error: clientsError } = await actor.admin.from("client_master").select("id, client_code, legal_name").or(`tax_pic_profile_id.eq.${actor.profile.id},accounting_pic_profile_id.eq.${actor.profile.id}`);
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });
  const allowed = new Set((clients || []).flatMap((client) => [client.id, client.client_code, client.legal_name]));
  return NextResponse.json({ data: (data || []).map((row) => ({
    ...row,
    payload: row.scope === "monthly_compliance"
      ? filterMonthlyPayload(row.payload, actor.profile.id, allowed)
      : filterPayload(row.payload, allowed, false)
  })) });
}

export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  const period = periodDetails(body.period);
  if (!period || !["preview-monthly-period", "generate-monthly-period"].includes(String(body.action || ""))) {
    return NextResponse.json({ error: "A valid monthly period is required." }, { status: 400 });
  }

  // A normal Tax PIC may generate only their own workload. Leadership can
  // deliberately choose an active Tax Team member when generating on behalf
  // of the team, while the snapshot continues to record who performed it.
  const requestedProfileId = String(body.targetProfileId || "").trim();
  const generatingForAnotherPic = Boolean(requestedProfileId && requestedProfileId !== actor.profile.id);
  if (generatingForAnotherPic && !isLeadership(actor.profile.role)) {
    return NextResponse.json({ error: "Only leadership can generate a month for another Tax PIC." }, { status: 403 });
  }
  const targetProfileId = requestedProfileId || actor.profile.id;
  const { data: targetProfile, error: targetError } = await actor.admin
    .from("staff_profiles")
    .select("id, full_name, display_name, team_division, directory_active")
    .eq("id", targetProfileId)
    .maybeSingle();
  if (targetError || !targetProfile) return NextResponse.json({ error: targetError?.message || "Selected Tax PIC was not found." }, { status: 400 });
  if (targetProfile.directory_active === false || targetProfile.team_division !== "Tax Team") {
    return NextResponse.json({ error: "Choose an active Tax Team PIC before generating a month." }, { status: 400 });
  }

  const { data: assignedClients, error: clientsError } = await actor.admin
    .from("client_master")
    .select("id, client_code, legal_name, company_form, npwp, industry, address, status, tax_pic_name, accounting_pic_name, partner_name, supervisor_name, tax_pic_profile_id, accounting_pic_profile_id, service_package, engagement_start, engagement_end, contract_started_at, tax_office_region, notes, monthly_fee, annual_fee, has_pph21, has_unifikasi, has_pph25_pp55, has_pb1, has_ppn")
    .eq("status", "Active")
    .eq("tax_pic_profile_id", targetProfileId)
    .order("legal_name");
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });

  const { data: current, error: currentError } = await actor.admin
    .from("operational_workspace_state")
    .select("payload, version")
    .eq("scope", "monthly_compliance")
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
  const existingPayload = current?.payload && typeof current.payload === "object" && !Array.isArray(current.payload)
    ? current.payload as Record<string, unknown>
    : {};
  const existingRows = Array.isArray(existingPayload[period.key]) ? existingPayload[period.key] as Record<string, unknown>[] : [];
  const existingClientIds = new Set(existingRows.map((row) => String(row.databaseId || row.clientId || "")));
  const candidates = (assignedClients || []).filter((client) => !existingClientIds.has(String(client.id)));

  if (body.action === "preview-monthly-period") {
    return NextResponse.json({
      period: period.key,
      taxPic: targetProfile.display_name || targetProfile.full_name,
      assigned: (assignedClients || []).length,
      alreadyGenerated: (assignedClients || []).length - candidates.length,
      clients: candidates.map((client) => ({ id: client.id, code: client.client_code, name: client.legal_name }))
    });
  }

  const createdRows = candidates.map((client) => monthlySnapshotRow(client, period, actor.profile));
  const nextPayload = { ...existingPayload, [period.key]: [...existingRows, ...createdRows] };
  const nextVersion = (current?.version || 0) + 1;
  const nextState = {
    scope: "monthly_compliance", payload: nextPayload, version: nextVersion,
    updated_by_profile_id: actor.profile.id, updated_at: new Date().toISOString()
  };
  const saveResult = current
    ? await actor.admin.from("operational_workspace_state").update(nextState).eq("scope", "monthly_compliance").eq("version", current.version).select("scope, payload, version, updated_at").maybeSingle()
    : await actor.admin.from("operational_workspace_state").insert(nextState).select("scope, payload, version, updated_at").maybeSingle();
  const { data: saved, error: saveError } = saveResult;
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "This month was generated in another session. Check the latest queue, then retry if your assigned clients are still missing.", code: "VERSION_CONFLICT" }, { status: 409 });
  await actor.admin.from("operational_workspace_audit").insert({
    scope: "monthly_compliance", version: nextVersion, actor_profile_id: actor.profile.id,
    action: `generated_month:${period.key}:${createdRows.length}`
  });
  const legacyAllowed = new Set((assignedClients || []).flatMap((client) => [client.id, client.client_code, client.legal_name]));
  return NextResponse.json({
    data: { ...saved, payload: filterMonthlyPayload(saved.payload, actor.profile.id, legacyAllowed) },
    period: period.key,
    taxPic: targetProfile.display_name || targetProfile.full_name,
    created: createdRows.length,
    alreadyGenerated: (assignedClients || []).length - createdRows.length
  });
}

export async function PUT(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json();
  const scope = String(body.scope || "");
  const version = Number(body.version || 0);
  if (!scopes.has(scope) || !body.payload || typeof body.payload !== "object") return NextResponse.json({ error: "A valid scope and payload are required." }, { status: 400 });
  const { data: current, error: currentError } = await actor.admin.from("operational_workspace_state").select("payload, version").eq("scope", scope).maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
  if (current && version !== current.version && (isLeadership(actor.profile.role) || scope !== "monthly_compliance")) return NextResponse.json({ error: "This workspace changed in another session. Reload the latest data before retrying.", code: "VERSION_CONFLICT", latest: current }, { status: 409 });
  let payload = body.payload;
  let allowed: Set<string> | null = null;
  if (!isLeadership(actor.profile.role)) {
    const { data: clients, error } = await actor.admin.from("client_master").select("id, client_code, legal_name").or(`tax_pic_profile_id.eq.${actor.profile.id},accounting_pic_profile_id.eq.${actor.profile.id}`);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    allowed = new Set((clients || []).flatMap((client) => [client.id, client.client_code, client.legal_name]));
    payload = filterPayload(payload, allowed, false);
  }
  if (scope === "monthly_compliance") payload = mergeMonthlyPayload(current?.payload, payload, allowed, actor.profile.id);
  const nextVersion = (current?.version || 0) + 1;
  const { data, error } = await actor.admin.from("operational_workspace_state").upsert({ scope, payload, version: nextVersion, updated_by_profile_id: actor.profile.id, updated_at: new Date().toISOString() }, { onConflict: "scope" }).select("scope, payload, version, updated_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await actor.admin.from("operational_workspace_audit").insert({ scope, version: nextVersion, actor_profile_id: actor.profile.id, action: "updated" });
  return NextResponse.json({ data });
}
