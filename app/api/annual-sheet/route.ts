import { after, NextResponse } from "next/server";
import { currentActor, isLeadership } from "@/lib/access";
import { addAnnualRows, annualCanManage, annualCanRead, annualScope, annualTeam, annualToSheet, applyAnnualEdits, manageAnnualRow, type AnnualTeam, type AnnualColumn } from "@/lib/annual-sheet";

async function context(actor: any, team: AnnualTeam, readWorkspace = true, readClients = false) {
  const [workspace, staff, clients, columns] = await Promise.all([
    readWorkspace ? actor.admin.from("operational_workspace_state").select("payload, version").eq("scope", annualScope(team)).maybeSingle() : Promise.resolve({ data: null, error: null }),
    actor.admin.from("staff_profiles").select("id, full_name, display_name, team_division, directory_active"),
    readClients ? actor.admin.from("client_master").select("id, legal_name, status, accounting_pic_name, accounting_pic_profile_id, tax_pic_name, tax_pic_profile_id").eq("status", "Active") : Promise.resolve({ data: [], error: null }),
    actor.admin.from("annual_sheet_columns").select("field, title, type, width").eq("team", team).order("created_at")
  ]);
  for (const result of [workspace, staff, clients]) if (result.error) throw new Error(result.error.message);
  if (columns.error && columns.error.code !== "42P01" && columns.error.code !== "PGRST205") throw new Error(columns.error.message);
  return { workspace: workspace.data, staff: staff.data || [], clients: clients.data || [], columns: (columns.data || []) as AnnualColumn[], columnsReady: !columns.error, readClients };
}
function responseData(actor: any, team: AnnualTeam, ctx: Awaited<ReturnType<typeof context>>, payload = ctx.workspace?.payload) {
  const rows = Array.isArray(payload) ? payload : [];
  return {
    team, userId: actor.userId, version: ctx.workspace?.version || 0, columns: ctx.columns, columnsReady: ctx.columnsReady,
    actor: { id: actor.profile.id, name: actor.profile.display_name || actor.profile.full_name, role: actor.profile.role, team: actor.profile.team_division },
    staff: ctx.staff.filter((person: any) => person.directory_active !== false).map((person: any) => ({ id: person.id, name: person.display_name || person.full_name, team: person.team_division })),
    clients: ctx.readClients ? team === "accounting" ? ctx.clients.filter((client: any) => client.accounting_pic_profile_id && (isLeadership(actor.profile.role) || client.accounting_pic_profile_id === actor.profile.id)).map((client: any) => ({ clientId: client.id, name: client.legal_name, accountingPic: client.accounting_pic_name || "", taxPic: client.tax_pic_name || "", active: true })) : [] : undefined,
    rows: rows.filter((row: any) => annualCanRead(row, actor.profile, ctx.staff)).map((row: any) => ({ ...annualToSheet(row, team, ctx.staff, ctx.columns), canManageRow: annualCanManage(row, team, actor.profile, ctx.staff) }))
  };
}
export async function GET(request: Request) {
  const started = Date.now();
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  let team: AnnualTeam;
  const params = new URL(request.url).searchParams;
  try { team = annualTeam(params.get("team")); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const authenticated = Date.now();
  const headers = () => ({ "Cache-Control": "no-store", "Server-Timing": `auth;dur=${authenticated - started},data;dur=${Date.now() - authenticated}` });
  try {
    if (params.get("part") === "clients") {
      if (team === "tax") return NextResponse.json({ clients: [], userId: actor.userId }, { headers: headers() });
      let query = actor.admin.from("client_master").select("id, legal_name, accounting_pic_name, accounting_pic_profile_id, tax_pic_name, tax_pic_profile_id").eq("status", "Active");
      if (!isLeadership(actor.profile.role)) query = query.eq("accounting_pic_profile_id", actor.profile.id);
      const { data, error } = await query.order("legal_name");
      if (error) throw new Error(error.message);
      return NextResponse.json({ userId: actor.userId, clients: (data || []).filter((client: any) => client.accounting_pic_profile_id).map((client: any) => ({ clientId: client.id, name: client.legal_name, accountingPic: client.accounting_pic_name || "", accountingPicId: client.accounting_pic_profile_id, taxPic: client.tax_pic_name || "", taxPicId: client.tax_pic_profile_id || "", active: true })) }, { headers: headers() });
    }
    return NextResponse.json(responseData(actor, team, await context(actor, team, true, team === "accounting" && params.get("part") !== "sheet")), { headers: headers() });
  }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 500 }); }
}
export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  let team: AnnualTeam;
  try { team = annualTeam(body.team); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  try {
    const ctx = await context(actor, team, false, team === "accounting" && Boolean(body.creates?.length));
    if (body.action === "add-column") {
      if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Only leadership can add shared columns." }, { status: 403 });
      if (!ctx.columnsReady) return NextResponse.json({ error: "Apply the annual_sheet_columns migration before adding shared columns." }, { status: 503 });
      const title = String(body.title || "").trim(), type = String(body.type || "");
      if (!title || title.length > 48 || !["text", "number", "date"].includes(type) || ctx.columns.length >= 30) return NextResponse.json({ error: "Use a title up to 48 characters and Text, Number or Date (maximum 30 shared columns)." }, { status: 400 });
      const { error } = await actor.admin.from("annual_sheet_columns").insert({ team, field: `custom_${crypto.randomUUID().replace(/-/g, "")}`, title, type, width: type === "text" ? 180 : 120, created_by_profile_id: actor.profile.id });
      if (error) return NextResponse.json({ error: error.code === "23505" ? "This column title already exists." : error.message }, { status: error.code === "23505" ? 409 : 500 });
      return NextResponse.json(responseData(actor, team, await context(actor, team)));
    }
    const rowAction = ["archive-row", "restore-row"].includes(body.action);
    if (rowAction ? typeof body.rowId !== "string" || !body.rowId || !body.before : body.action !== "commit" || !Array.isArray(body.edits) || !Array.isArray(body.creates) || body.edits.length + body.creates.length < 1 || body.edits.length + body.creates.length > 250) return NextResponse.json({ error: "Submit valid annual row changes." }, { status: 400 });
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: current, error: readError } = await actor.admin.from("operational_workspace_state").select("payload, version").eq("scope", annualScope(team)).maybeSingle();
      if (readError) throw new Error(readError.message);
      const stored = Array.isArray(current?.payload) ? current.payload : [];
      let payload = rowAction ? manageAnnualRow(stored, body.rowId, body.before, body.action === "restore-row", team, actor.profile, ctx.staff, ctx.columns) : applyAnnualEdits(stored, body.edits, team, actor.profile, ctx.staff, ctx.columns);
      if (!rowAction) payload = addAnnualRows(payload, body.creates, team, actor.profile, ctx.staff, ctx.clients);
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
      return NextResponse.json({ ...responseData(actor, team, ctx), clients: undefined });
    }
    return NextResponse.json({ error: "Annual work is busy. Refresh and retry.", code: "RETRY_REQUIRED" }, { status: 409 });
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: message, code: message.startsWith("CONFLICT:") ? "FIELD_CONFLICT" : "INVALID_EDIT" }, { status: message.startsWith("CONFLICT:") ? 409 : /cannot (edit|delete|restore)|Only leadership|Only the corresponding|not eligible/.test(message) ? 403 : 400 });
  }
}
