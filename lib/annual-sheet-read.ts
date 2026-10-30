import { isLeadership } from "@/lib/access";
import { annualCanManage, annualCanRead, annualScope, annualToSheet, type AnnualTeam, type AnnualColumn } from "@/lib/annual-sheet";

export async function annualContext(actor: any, team: AnnualTeam, readWorkspace = true, readClients = false) {
  const [workspace, staff, clients, columns] = await Promise.all([
    readWorkspace ? actor.admin.from("operational_workspace_state").select("payload, version").eq("scope", annualScope(team)).maybeSingle() : Promise.resolve({ data: null, error: null }),
    actor.admin.from("staff_profiles").select("id, full_name, display_name, team_division, role, directory_active"),
    readClients ? actor.admin.from("client_master").select("id, legal_name, company_form, status, accounting_pic_name, accounting_pic_profile_id, tax_pic_name, tax_pic_profile_id").eq("status", "Active") : Promise.resolve({ data: [], error: null }),
    actor.admin.from("annual_sheet_columns").select("field, title, type, width").eq("team", team).order("created_at")
  ]);
  for (const result of [workspace, staff, clients]) if (result.error) throw new Error(result.error.message);
  if (columns.error && columns.error.code !== "42P01" && columns.error.code !== "PGRST205") throw new Error(columns.error.message);
  return { workspace: workspace.data, staff: staff.data || [], clients: clients.data || [], columns: (columns.data || []) as AnnualColumn[], columnsReady: !columns.error, readClients };
}
export function annualResponseData(actor: any, team: AnnualTeam, ctx: Awaited<ReturnType<typeof annualContext>>, payload = ctx.workspace?.payload) {
  const rows = Array.isArray(payload) ? payload : [];
  return {
    team, userId: actor.userId, version: ctx.workspace?.version || 0, columns: ctx.columns, columnsReady: ctx.columnsReady,
    actor: { id: actor.profile.id, name: actor.profile.display_name || actor.profile.full_name, role: actor.profile.role, team: actor.profile.team_division },
    staff: ctx.staff.filter((person: any) => person.directory_active === true).map((person: any) => ({ id: person.id, name: person.display_name || person.full_name, team: person.team_division, role: person.role || "staff" })),
    clients: ctx.readClients ? team === "accounting" ? ctx.clients.filter((client: any) => client.accounting_pic_profile_id && (isLeadership(actor.profile.role) || client.accounting_pic_profile_id === actor.profile.id)).map((client: any) => ({ clientId: client.id, name: client.legal_name, accountingPic: client.accounting_pic_name || "", taxPic: client.tax_pic_name || "", active: true })) : [] : undefined,
    rows: rows.filter((row: any) => annualCanRead(row, actor.profile, ctx.staff)).map((row: any) => ({ ...annualToSheet(row, team, ctx.staff, ctx.columns), canManageRow: annualCanManage(row, team, actor.profile, ctx.staff) }))
  };
}
