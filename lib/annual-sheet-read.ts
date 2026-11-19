import { isLeadership } from "@/lib/access";
import { annualCanManage, annualCanRead, annualScope, annualToSheet, type AnnualTeam, type AnnualColumn } from "@/lib/annual-sheet";
import { readAllPages } from "@/lib/read-all-pages";

type ReadYear = number | "auto" | null;
type AnnualWorkspace = { payload: unknown; version: number };
type YearProjection = { rows: any[]; yearIndex: any[]; version: number };
const rowYear = (row: any) => Number(row.taxYear || row.year) || 0;
const visibleRows = (rows: unknown, actor: any, staff: any[]) =>
  (Array.isArray(rows) ? rows : []).filter(row => row && typeof row === "object" && !Array.isArray(row) && annualCanRead(row, actor.profile, staff));
const yearsOf = (rows: any[]) => [...new Set(rows.map(rowYear))].sort((a,b) => b-a);
const defaultAnnualYear = () => Number(new Intl.DateTimeFormat("en", {timeZone:"Asia/Makassar",year:"numeric"}).format(new Date())) - 1;
const preferredYear = (years: number[], fallback: number) => years.includes(fallback) || !years.length ? fallback : years[0];

export function annualReadYear(value: unknown): number | "auto" | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === "auto") return "auto";
  const year = Number(value);
  if (!Number.isInteger(year) || year !== 0 && (year < 2000 || year > 2100)) throw new Error("Choose a valid annual year.");
  return year;
}

async function readWorkspaceState(actor: any, team: AnnualTeam): Promise<AnnualWorkspace | null> {
  const {data,error} = await actor.admin.from("operational_workspace_state").select("payload, version").eq("scope", annualScope(team)).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function annualContext(actor: any, team: AnnualTeam, readWorkspace = true, readClients = false) {
  const [workspace, staff, clients, columns] = await Promise.all([
    readWorkspace ? readWorkspaceState(actor, team) : Promise.resolve(null),
    readAllPages((from,to) => actor.admin.from("staff_profiles").select("id, full_name, display_name, team_division, role, directory_active", { count: "exact" }).order("id").range(from,to)),
    readClients ? readAllPages((from,to) => actor.admin.from("client_master").select("id, legal_name, company_form, status, accounting_pic_name, accounting_pic_profile_id, tax_pic_name, tax_pic_profile_id", { count: "exact" }).eq("status", "Active").order("id").range(from,to)) : Promise.resolve([]),
    actor.admin.from("annual_sheet_columns").select("field, title, type, width").eq("team", team).order("created_at")
  ]);
  if (columns.error && columns.error.code !== "42P01" && columns.error.code !== "PGRST205") throw new Error(columns.error.message);
  return { workspace, staff, clients, columns: (columns.data || []) as AnnualColumn[], columnsReady: !columns.error, readClients };
}

export function annualResponseData(actor: any, team: AnnualTeam, ctx: Awaited<ReturnType<typeof annualContext>>, payload = ctx.workspace?.payload, requestedYear: ReadYear = null, includeIds: string[] = [], projectedYears?: number[]) {
  const rows = visibleRows(payload, actor, ctx.staff);
  const availableYears = projectedYears ?? yearsOf(rows);
  const year = requestedYear === "auto" ? preferredYear(availableYears, defaultAnnualYear()) : requestedYear;
  const included = new Set(includeIds);
  return {
    team, userId: actor.userId, version: ctx.workspace?.version || 0, columns: ctx.columns, columnsReady: ctx.columnsReady,
    ...(year === null ? {} : { sheetYear: year, availableYears }),
    actor: { id: actor.profile.id, name: actor.profile.display_name || actor.profile.full_name, role: actor.profile.role, team: actor.profile.team_division },
    staff: ctx.staff.filter((person: any) => person.directory_active === true).map((person: any) => ({ id: person.id, name: person.display_name || person.full_name, team: person.team_division, role: person.role || "staff" })),
    clients: ctx.readClients ? team === "accounting" ? ctx.clients.filter((client: any) => client.accounting_pic_profile_id && (isLeadership(actor.profile.role) || client.accounting_pic_profile_id === actor.profile.id)).map((client: any) => ({ clientId: client.id, name: client.legal_name, accountingPic: client.accounting_pic_name || "", taxPic: client.tax_pic_name || "", active: true })) : [] : undefined,
    rows: rows.filter(row => year === null || rowYear(row) === year || included.has(String(row.id || row.annualWorkId))).map(row => ({ ...annualToSheet(row, team, ctx.staff, ctx.columns), canManageRow: annualCanManage(row, team, actor.profile, ctx.staff) }))
  };
}

async function readYearProjection(actor: any, team: AnnualTeam, year: number): Promise<YearProjection | null> {
  const {data,error} = await actor.admin.rpc("read_annual_sheet_year", {p_scope:annualScope(team), p_year:year});
  if (error) {
    if (["PGRST202", "42883"].includes(error.code)) return null; // Application can ship before the RPC.
    throw new Error(error.message);
  }
  if (!data || !Number.isInteger(data.version) || !Array.isArray(data.rows) || !Array.isArray(data.yearIndex)) throw new Error("Annual year response was incomplete.");
  return data;
}

export async function readAnnualSheet(actor: any, team: AnnualTeam, requestedYear: ReadYear, readClients = false) {
  if (requestedYear === null) return annualResponseData(actor, team, await annualContext(actor, team, true, readClients));
  const initialYear = requestedYear === "auto" ? defaultAnnualYear() : requestedYear;
  const [ctx, initial] = await Promise.all([
    annualContext(actor, team, false, readClients),
    readYearProjection(actor, team, initialYear)
  ]);
  const fallback = async () => {
    const workspace = await readWorkspaceState(actor, team);
    return annualResponseData(actor, team, {...ctx,workspace}, workspace?.payload, requestedYear);
  };
  if (!initial) return fallback();

  const index = visibleRows(initial.yearIndex, actor, ctx.staff);
  const years = yearsOf(index);
  const year = requestedYear === "auto" ? preferredYear(years, initialYear) : initialYear;
  if (year !== 0 && (!Number.isInteger(year) || year < 2000 || year > 2100)) return fallback();
  const projection = year === initialYear ? initial : await readYearProjection(actor, team, year);
  if (!projection || projection.version !== initial.version) return fallback();

  // The current JS rules remain authoritative, including unusual legacy year
  // formats. A projection that disagrees with the authorized index is never served.
  const visible = visibleRows(projection.rows, actor, ctx.staff);
  const expected = index.filter(row => rowYear(row) === year).length;
  if (visible.length !== expected || visible.some(row => rowYear(row) !== year)) return fallback();
  return annualResponseData(actor, team, {...ctx,workspace:{payload:projection.rows,version:projection.version}}, projection.rows, year, [], years);
}
