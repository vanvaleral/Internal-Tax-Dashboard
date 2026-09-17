import { NextResponse } from "next/server";
import { currentActor, isLeadership } from "@/lib/access";
import { redactFees } from "@/lib/workspace-security";
import { parseAmount } from "@/public/claim-values";

const labels: Record<string, string> = { pph21: "PPh Pasal 21", unifikasi: "PPh Unifikasi", pph25: "PPh Pasal 25", phrpb1: "PB1", ppn: "PPN" };

function canAccess(actor: Awaited<ReturnType<typeof currentActor>>, claim: Record<string, unknown>) {
  if ("error" in actor) return false;
  return isLeadership(actor.profile.role) || [claim.tax_pic_profile_id, claim.accounting_pic_profile_id].includes(actor.profile.id);
}

export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  const period = String(body.period || "");
  const clientId = String(body.clientId || "");
  if (!period || !clientId) return NextResponse.json({ error: "A generated period and client are required." }, { status: 400 });
  const [{ data: workspace, error }, { data: existing, error: existingError }] = await Promise.all([
    actor.admin.from("operational_workspace_state").select("payload").eq("scope", "monthly_compliance").maybeSingle(),
    actor.admin.from("monthly_tax_claims").select("id, draft, updated_at").eq("period_key", period).eq("client_id", clientId).maybeSingle()
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  const rows = workspace?.payload && typeof workspace.payload === "object" && Array.isArray((workspace.payload as Record<string, unknown>)[period]) ? (workspace.payload as Record<string, any>)[period] : [];
  const row = rows.find((item: Record<string, unknown>) => String(item.databaseId || item.clientId || "") === clientId);
  if (!row) return NextResponse.json({ error: "The generated client snapshot was not found." }, { status: 404 });
  if (!isLeadership(actor.profile.role) && String(row.taxPicSnapshotProfileId || row.taxPicProfileId || "") !== actor.profile.id) return NextResponse.json({ error: "Only the Tax PIC can create this tax claim." }, { status: 403 });
  const submittedObligations = body.obligations && typeof body.obligations === "object" ? body.obligations : {};
  let obligationRows;
  try {
    obligationRows = Object.entries(row.obligations || {})
      .filter(([, item]: any) => item?.status !== "na")
      .map(([key, item]: any) => {
        const submitted = (submittedObligations as Record<string, any>)[key];
        return [labels[key] || key, period, parseAmount(submitted?.payableAmount ?? item?.payableAmount ?? 0)];
      });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid claim amount." }, { status: 400 }); }
  if (existing) {
    const draft = { ...(existing.draft && typeof existing.draft === "object" ? existing.draft : {}), rows: obligationRows };
    const { data: refreshed, error: refreshError } = await actor.admin.from("monthly_tax_claims").update({ draft }).eq("id", existing.id).eq("updated_at", existing.updated_at).select("id, draft, updated_at").maybeSingle();
    if (refreshError) return NextResponse.json({ error: refreshError.message }, { status: 500 });
    if (!refreshed) return NextResponse.json({ error: "This claim changed while payable values were being refreshed. Open it again to retry.", code: "VERSION_CONFLICT" }, { status: 409 });
    return NextResponse.json({ data: refreshed, viewerId: actor.profile.id, existing: true, refreshed: true });
  }
  const clientName = `${row.businessForm && row.businessForm !== "Individual" ? `${row.businessForm} ` : ""}${row.name || ""}`.trim();
  const draft = { title: "KLAIM PAJAK", client: clientName, "client-note": "Ringkasan kewajiban pajak yang perlu dipersiapkan untuk masa pajak berikut.", period, rows: obligationRows, issued: `Denpasar, ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`, signatory: actor.profile.display_name || actor.profile.full_name, role: "Tax Consultant" };
  const { data, error: insertError } = await actor.admin.from("monthly_tax_claims").insert({ period_key: period, client_id: clientId, tax_pic_profile_id: row.taxPicSnapshotProfileId || row.taxPicProfileId, accounting_pic_profile_id: row.accountingPicSnapshotProfileId || row.accountingPicProfileId || null, created_by_profile_id: actor.profile.id, source_snapshot: row, draft }).select("id, draft, updated_at").single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ data, viewerId: actor.profile.id, existing: false });
}

export async function GET(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Claim ID is required." }, { status: 400 });
  const { data, error } = await actor.admin.from("monthly_tax_claims").select("*").eq("id", id).maybeSingle();
  if (error || !data || !canAccess(actor, data)) return NextResponse.json({ error: "Tax claim was not found." }, { status: 404 });
  return NextResponse.json({ data: isLeadership(actor.profile.role) ? data : redactFees(data), viewerId: actor.profile.id });
}

export async function PATCH(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const { data: claim, error } = await actor.admin.from("monthly_tax_claims").select("*").eq("id", id).maybeSingle();
  if (error || !claim || !canAccess(actor, claim)) return NextResponse.json({ error: "Tax claim was not found." }, { status: 404 });
  if (!body.draft || !Array.isArray(body.draft.rows) || body.draft.rows.length < 1 || body.draft.rows.length > 100) return NextResponse.json({ error: "A claim must contain 1-100 payment rows." }, { status: 400 });
  let draft;
  try {
    draft = { ...body.draft, rows: body.draft.rows.map((row: unknown[]) => {
      if (!Array.isArray(row) || row.length !== 3) throw new Error("Each claim row needs a tax type, period, and amount.");
      return [String(row[0]).slice(0, 250), String(row[1]).slice(0, 100), parseAmount(row[2])];
    }) };
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid claim amount." }, { status: 400 }); }
  if (body.version !== claim.updated_at) return NextResponse.json({ error: "This claim changed in another session. Reload before saving.", code: "VERSION_CONFLICT" }, { status: 409 });
  const { data, error: updateError } = await actor.admin.from("monthly_tax_claims").update({ draft }).eq("id", id).eq("updated_at", body.version).select("id, updated_at").maybeSingle();
  if (!updateError && !data) return NextResponse.json({ error: "Another session saved this claim first.", code: "VERSION_CONFLICT" }, { status: 409 });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ data });
}
