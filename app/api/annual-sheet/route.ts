import { after, NextResponse } from "next/server";
import { currentActor, isLeadership } from "@/lib/access";
import { annualContext, annualResponseData } from "@/lib/annual-sheet-read";
import { addAnnualRows, annualIndividualClient, annualScope, annualTeam, applyAnnualEdits, manageAnnualRow, type AnnualTeam } from "@/lib/annual-sheet";

export async function GET(request: Request) {
  const started = Date.now();
  const actor = await currentActor(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  let team: AnnualTeam;
  const params = new URL(request.url).searchParams;
  try { team = annualTeam(params.get("team")); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const authenticated = Date.now();
  const headers = () => ({ "Cache-Control": "no-store", "Server-Timing": `auth;dur=${authenticated - started},data;dur=${Date.now() - authenticated}` });
  try {
    if (params.get("part") === "clients") {
      const picField = team === "tax" ? "tax_pic_profile_id" : "accounting_pic_profile_id";
      let query = actor.admin.from("client_master").select("id, legal_name, company_form, accounting_pic_name, accounting_pic_profile_id, tax_pic_name, tax_pic_profile_id").eq("status", "Active");
      if (!isLeadership(actor.profile.role)) query = query.eq(picField, actor.profile.id);
      const { data, error } = await query.order("legal_name");
      if (error) throw new Error(error.message);
      return NextResponse.json({ userId: actor.userId, clients: (data || []).filter((client: any) => client[picField] && (team !== "tax" || annualIndividualClient(client))).map((client: any) => ({ clientId: team === "tax" ? `client:${client.id}` : client.id, ...(team === "tax" ? { sourceClientId: client.id, linkedClientId: client.id, subjectId: client.id, subjectType: "Individual", groupName: "", recordMethod: "Pencatatan" } : {}), name: client.legal_name, accountingPic: client.accounting_pic_name || "", accountingPicId: client.accounting_pic_profile_id || "", taxPic: client.tax_pic_name || "", taxPicId: client.tax_pic_profile_id || "", active: true })) }, { headers: headers() });
    }
    return NextResponse.json(annualResponseData(actor, team, await annualContext(actor, team, true, team === "accounting" && params.get("part") !== "sheet")), { headers: headers() });
  }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 500 }); }
}
export async function POST(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  let team: AnnualTeam;
  try { team = annualTeam(body.team); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  try {
    const ctx = await annualContext(actor, team, true, Boolean(body.creates?.some((row: any) => team === "accounting" ? row.clientId : row.sourceClientId)));
    if (body.action === "add-column") {
      if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Only leadership can add shared columns." }, { status: 403 });
      if (!ctx.columnsReady) return NextResponse.json({ error: "Apply the annual_sheet_columns migration before adding shared columns." }, { status: 503 });
      const title = String(body.title || "").trim(), type = String(body.type || "");
      if (!title || title.length > 48 || !["text", "number", "date"].includes(type) || ctx.columns.length >= 30) return NextResponse.json({ error: "Use a title up to 48 characters and Text, Number or Date (maximum 30 shared columns)." }, { status: 400 });
      const { error } = await actor.admin.from("annual_sheet_columns").insert({ team, field: `custom_${crypto.randomUUID().replace(/-/g, "")}`, title, type, width: type === "text" ? 180 : 120, created_by_profile_id: actor.profile.id });
      if (error) return NextResponse.json({ error: error.code === "23505" ? "This column title already exists." : error.message }, { status: error.code === "23505" ? 409 : 500 });
      return NextResponse.json(annualResponseData(actor, team, await annualContext(actor, team)));
    }
    const rowAction = ["archive-row", "restore-row"].includes(body.action);
    if (rowAction ? typeof body.rowId !== "string" || !body.rowId || !body.before : body.action !== "commit" || !Array.isArray(body.edits) || !Array.isArray(body.creates) || body.edits.length + body.creates.length < 1 || body.edits.length + body.creates.length > 250) return NextResponse.json({ error: "Submit valid annual row changes." }, { status: 400 });
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: current, error: readError } = attempt === 0 ? { data: ctx.workspace, error: null } : await actor.admin.from("operational_workspace_state").select("payload, version").eq("scope", annualScope(team)).maybeSingle();
      if (readError) throw new Error(readError.message);
      const stored = Array.isArray(current?.payload) ? current.payload : [];
      let payload = rowAction ? manageAnnualRow(stored, body.rowId, body.before, body.action === "restore-row", team, actor.profile, ctx.staff, ctx.columns) : body.edits.length ? applyAnnualEdits(stored, body.edits, team, actor.profile, ctx.staff, ctx.columns) : stored;
      if (!rowAction && body.creates.length) payload = addAnnualRows(payload, body.creates, team, actor.profile, ctx.staff, ctx.clients, ctx.columns);
      const version = (current?.version || 0) + 1;
      const nextState = { scope: annualScope(team), payload, version, updated_by_profile_id: actor.profile.id, updated_at: new Date().toISOString() };
      const result = current
        ? await actor.admin.from("operational_workspace_state").update(nextState).eq("scope", annualScope(team)).eq("version", current.version).select("version").maybeSingle()
        : await actor.admin.from("operational_workspace_state").insert(nextState).select("version").maybeSingle();
      if (result.error?.code === "23505" || !result.error && !result.data) continue;
      if (result.error) throw new Error(result.error.message);
      // Full field-level history is committed atomically inside each workspace row.
      after(async () => {
        try {
          const audit = await actor.admin.from("operational_workspace_audit").insert({ scope: annualScope(team), version, actor_profile_id: actor.profile.id, action: rowAction ? `annual_sheet:${body.action}:${body.rowId}` : `annual_sheet:${body.edits.length}_edits:${body.creates.length}_creates` });
          if (audit.error) console.warn("[annual-sheet] summary audit failed", audit.error.message);
        } catch (error) { console.warn("[annual-sheet] summary audit failed", error); }
      });
      ctx.workspace = { payload, version };
      return NextResponse.json({ ...annualResponseData(actor, team, ctx), clients: undefined });
    }
    return NextResponse.json({ error: "Annual work is busy. Refresh and retry.", code: "RETRY_REQUIRED" }, { status: 409 });
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: message, code: message.startsWith("CONFLICT:") ? "FIELD_CONFLICT" : "INVALID_EDIT" }, { status: message.startsWith("CONFLICT:") ? 409 : /cannot (edit|delete|restore)|Only leadership|Only the corresponding|not eligible/.test(message) ? 403 : 400 });
  }
}
