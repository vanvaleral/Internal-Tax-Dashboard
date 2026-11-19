import { isLeadership } from "@/lib/access";
import { annualCanManage, annualCanRead, annualScope, annualToSheet, type AnnualTeam, type AnnualColumn } from "@/lib/annual-sheet";
import { readAllPages } from "@/lib/read-all-pages";

export function annualReadYear(value: unknown): number | "auto" | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === "auto") return "auto";
  const year = Number(value);
  if (!Number.isInteger(year) || year !== 0 && (year < 2000 || year > 2100)) throw new Error("Choose a valid annual year.");
  return year;
}

export async function annualContext(actor: any, team: AnnualTeam, readWorkspace = true, readClients = false) {
  const [workspace, staff, clients, columns] = await Promise.all([
    readWorkspace ? actor.admin.from("operational_workspace_state").select("payload, version").eq("scope", annualScope(team)).maybeSingle() : Promise.resolve({ data: null, error: null }),
    readAllPages((from,to) => actor.admin.from("staff_profiles").select("id, full_name, display_name, team_division, role, directory_active", { count: "exact" }).order("id").range(from,to)).then(data => ({data,error:null})),
    readClients ? readAllPages((from,to) => actor.admin.from("client_master").select("id, legal_name, company_form, status, accounting_pic_name, accounting_pic_profile_id, tax_pic_name, tax_pic_profile_id", { count: "exact" }).eq("status", "Active").order("id").range(from,to)).then(data => ({data,error:null})) : Promise.resolve({ data: [], error: null }),
    actor.admin.from("annual_sheet_columns").select("field, title, type, width").eq("team", team).order("created_at")
  ]);
  for (const result of [workspace, staff, clients]) if (result.error) throw new Error(result.error.message);
  if (columns.error && columns.error.code !== "42P01" && columns.error.code !== "PGRST205") throw new Error(columns.error.message);
  return { workspace: workspace.data, staff: staff.data || [], clients: clients.data || [], columns: (columns.data || []) as AnnualColumn[], columnsReady: !columns.error, readClients };
}
export function annualResponseData(actor: any, team: AnnualTeam, ctx: Awaited<ReturnType<typeof annualContext>>, payload = ctx.workspace?.payload, requestedYear: number | "auto" | null = null, includeIds: string[] = []) {
  const rows = (Array.isArray(payload) ? payload : []).filter((row: any) => annualCanRead(row, actor.profile, ctx.staff));
  const availableYears = [...new Set<number>(rows.map((row: any) => Number(row.taxYear || row.year) || 0))].sort((a,b)=>b-a);
  const defaultYear = Number(new Intl.DateTimeFormat("en", {timeZone:"Asia/Makassar",year:"numeric"}).format(new Date())) - 1;
  const year = requestedYear === "auto" ? availableYears.includes(defaultYear) || !availableYears.length ? defaultYear : availableYears[0] : requestedYear;
  const included = new Set(includeIds);
  return {
    team, userId: actor.userId, version: ctx.workspace?.version || 0, columns: ctx.columns, columnsReady: ctx.columnsReady,
    ...(year === null ? {} : { sheetYear: year, availableYears }),
    actor: { id: actor.profile.id, name: actor.profile.display_name || actor.profile.full_name, role: actor.profile.role, team: actor.profile.team_division },
    staff: ctx.staff.filter((person: any) => person.directory_active === true).map((person: any) => ({ id: person.id, name: person.display_name || person.full_name, team: person.team_division, role: person.role || "staff" })),
    clients: ctx.readClients ? team === "accounting" ? ctx.clients.filter((client: any) => client.accounting_pic_profile_id && (isLeadership(actor.profile.role) || client.accounting_pic_profile_id === actor.profile.id)).map((client: any) => ({ clientId: client.id, name: client.legal_name, accountingPic: client.accounting_pic_name || "", taxPic: client.tax_pic_name || "", active: true })) : [] : undefined,
    rows: rows.filter((row: any) => year === null || (Number(row.taxYear || row.year) || 0) === year || included.has(String(row.id || row.annualWorkId))).map((row: any) => ({ ...annualToSheet(row, team, ctx.staff, ctx.columns), canManageRow: annualCanManage(row, team, actor.profile, ctx.staff) }))
  };
}
