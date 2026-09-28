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
  if (body.action === "prepare-print") {
    const id = String(body.id || "");
    const { data: claim, error: claimError } = await actor.admin.from("monthly_tax_claims").select("id, draft, updated_at, tax_pic_profile_id, accounting_pic_profile_id").eq("id", id).maybeSingle();
    if (claimError || !claim || !canAccess(actor, claim)) return NextResponse.json({ error: "Tax claim was not found." }, { status: 404 });
    if (body.version !== claim.updated_at) return NextResponse.json({ error: "The saved claim changed. Reload before printing.", code: "VERSION_CONFLICT" }, { status: 409 });
    const { data, error } = await actor.admin.rpc("prepare_monthly_tax_claim_print", {
      p_claim_id: id, p_version: body.version, p_actor_profile_id: actor.profile.id
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.id) return NextResponse.json({ error: "The claim changed before the print snapshot was saved.", code: "VERSION_CONFLICT" }, { status: 409 });
    return NextResponse.json({ data: { id: data.id, printed_at: data.printed_at } });
  }
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
  if (existing) return NextResponse.json({ data: existing, viewerId: actor.profile.id, existing: true });
  const clientName = `${row.businessForm && row.businessForm !== "Individual" ? `${row.businessForm} ` : ""}${row.name || ""}`.trim();
  const draft = { title: "KLAIM PAJAK", client: clientName, "client-note": "Ringkasan kewajiban pajak yang perlu dipersiapkan untuk masa pajak berikut.", period, rows: obligationRows, issued: `Denpasar, ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`, signatory: actor.profile.display_name || actor.profile.full_name, role: "Tax Consultant" };
  const { data, error: insertError } = await actor.admin.from("monthly_tax_claims").insert({ period_key: period, client_id: clientId, tax_pic_profile_id: row.taxPicSnapshotProfileId || row.taxPicProfileId, accounting_pic_profile_id: row.accountingPicSnapshotProfileId || row.accountingPicProfileId || null, created_by_profile_id: actor.profile.id, source_snapshot: row, draft }).select("id, draft, updated_at").single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ data, viewerId: actor.profile.id, existing: false });
}

export async function GET(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const url = new URL(request.url);
  const printsFor = url.searchParams.get("prints");
  const printId = url.searchParams.get("printId");
  if (printsFor || printId) {
    const { data: print, error: printError } = printId
      ? await actor.admin.from("monthly_tax_claim_prints").select("id, claim_id, draft_snapshot, printed_at").eq("id", printId).maybeSingle()
      : { data: null, error: null };
    if (printError || (printId && !print)) return NextResponse.json({ error: "Print snapshot was not found." }, { status: 404 });
    const claimId = print?.claim_id || printsFor;
    const { data: claim, error: claimError } = await actor.admin.from("monthly_tax_claims").select("id, tax_pic_profile_id, accounting_pic_profile_id").eq("id", claimId).maybeSingle();
    if (claimError || !claim || !canAccess(actor, claim)) return NextResponse.json({ error: "Tax claim was not found." }, { status: 404 });
    if (print) return NextResponse.json({ data: { id: print.id, claimId: claim.id, draft: print.draft_snapshot, printedAt: print.printed_at }, viewerId: actor.profile.id });
    const { data, error } = await actor.admin.from("monthly_tax_claim_prints").select("id, claim_id, printed_at, printed_by_profile_id").eq("claim_id", claim.id).order("printed_at", { ascending: false }).limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data || [] });
  }
  if (url.searchParams.get("list") === "1") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 200), 1), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);
    let query = actor.admin.from("monthly_tax_claims")
      .select("id, period_key, client_id, tax_pic_profile_id, accounting_pic_profile_id, created_at, updated_at, source_snapshot")
      .order("created_at", { ascending: false }).order("id").range(offset, offset + limit - 1);
    if (!isLeadership(actor.profile.role)) query = query.or(`tax_pic_profile_id.eq.${actor.profile.id},accounting_pic_profile_id.eq.${actor.profile.id}`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: (data || []).map((claim) => ({
      id: claim.id, period: claim.period_key, clientId: claim.client_id,
      clientName: claim.source_snapshot?.name || claim.source_snapshot?.clientName || "Client",
      createdAt: claim.created_at, updatedAt: claim.updated_at
    })) });
  }
  const id = url.searchParams.get("id");
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
