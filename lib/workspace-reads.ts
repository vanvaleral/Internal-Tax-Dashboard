import { isLeadership, type CurrentActor } from "@/lib/access";
import { scopedWorkspace } from "@/lib/workspace-security";
import { canManageAccess } from "@/lib/feature-access";
import { caseActivityQuery, caseActivitySelect, withCaseActivity } from "@/lib/case-activity";
import { readAllPages } from "@/lib/read-all-pages";

export async function readStaff(actor: CurrentActor, includeInactive = false) {
  const data = await readAllPages((from, to) => {
    let query = actor.admin.from("staff_profiles").select("id, full_name, display_name, team_division, role, employment_title, auth_user_id, claimed_at, directory_active, archived_at, access_deletion_started_at, access_deleted_at, client_import_allowed, client_export_allowed", { count: "exact" }).order("display_name").order("id").range(from, to);
    if (!includeInactive) query = query.eq("directory_active", true);
    return query;
  });
  return { staff: (data || []).map(profile => {
    const base = { id: profile.id, full_name: profile.full_name, display_name: profile.display_name || profile.full_name, team_division: profile.team_division, role: profile.role };
    return canManageAccess(actor.profile.role)
      ? { ...base, employment_title: profile.employment_title || null, auth_user_id: profile.auth_user_id || null, claimed_at: profile.claimed_at || null, directory_active: profile.directory_active !== false, archived_at: profile.archived_at || null, access_deletion_started_at: profile.access_deletion_started_at || null, access_deleted_at: profile.access_deleted_at || null, client_import_allowed: profile.client_import_allowed ?? null, client_export_allowed: profile.client_export_allowed ?? null }
      : base;
  }) };
}

export async function readClients(actor: CurrentActor, params = new URLSearchParams()) {
  const search = params.get("search")?.trim();
  const limit = Math.min(Math.max(Number(params.get("limit") || 500), 1), 1000);
  const offset = Math.max(Number(params.get("offset") || 0), 0);
  const build = (from: number, to: number) => {
  let query = actor.admin.from("client_master").select("*", { count: "exact" }).order("legal_name").order("id").range(from, to);
  if (!isLeadership(actor.profile.role)) query = query.or(`tax_pic_profile_id.eq.${actor.profile.id},accounting_pic_profile_id.eq.${actor.profile.id}`);
  if (search) query = query.or(`legal_name.ilike.%${search}%,client_code.ilike.%${search}%,npwp.ilike.%${search}%`);
  return query;
  };
  const complete = !params.has("offset") && !params.has("limit");
  if (!Number.isInteger(limit) || !Number.isInteger(offset)) throw new Error("Invalid list page.");
  const { data, error, count } = complete
    ? await readAllPages(build).then(data => ({ data, error: null, count: data.length }))
    : await build(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const feeAccess = isLeadership(actor.profile.role);
  return { data: feeAccess ? data || [] : (data || []).map(client => Object.fromEntries(Object.entries(client).filter(([key]) => !["monthly_fee", "annual_fee", "fee_notes"].includes(key)))), count, mode: "database", feeAccess };
}

export async function readCases(actor: CurrentActor, includeDeleted = false) {
  const build = (enriched: boolean, from: number, to: number) => {
    let query = actor.admin.from("tax_cases").select(enriched ? caseActivitySelect : "*", { count: "exact" });
    if (enriched) query = caseActivityQuery(query,actor.profile.id);
    query = query.order("updated_at", { ascending: false }).order("id").range(from, to);
    if (includeDeleted) {
      query = query.not("deleted_at", "is", null);
      if (!isLeadership(actor.profile.role)) query = query.eq("deleted_by_profile_id", actor.profile.id);
    } else {
      query = query.is("deleted_at", null);
      if (!isLeadership(actor.profile.role)) query = query.or(`tax_pic_profile_id.eq.${actor.profile.id},accounting_pic_profile_id.eq.${actor.profile.id}`);
    }
    return query;
  };
  let data: any[], available = true;
  try { data = await readAllPages((from, to) => build(true, from, to)); }
  catch (error) {
    if (!["42P01","PGRST200","PGRST205"].includes((error as any).code)) throw error;
    available = false; data = await readAllPages((from, to) => build(false, from, to));
  }
  return { data: (data || []).map((row: any) => available ? withCaseActivity(row,actor.profile.id,actor.userId) : {...row,activity_available:false}) };
}

export async function readOperations(actor: CurrentActor, scope: string | null) {
  let query = actor.admin.from("operational_workspace_state").select("scope, payload, version, updated_at");
  if (scope && ["monthly_compliance", "annual_accounting", "annual_tax"].includes(scope)) query = query.eq("scope", scope);
  const leadership = isLeadership(actor.profile.role);
  const [workspace, clients] = await Promise.all([
    query,
    leadership ? Promise.resolve({ data: [], error: null })
      : readAllPages((from,to) => actor.admin.from("client_master").select("id, client_code, legal_name", { count: "exact" }).or(`tax_pic_profile_id.eq.${actor.profile.id},accounting_pic_profile_id.eq.${actor.profile.id}`).order("id").range(from,to)).then(data => ({data,error:null}))
  ]);
  if (workspace.error) throw new Error(workspace.error.message);
  const allowed = new Set((clients.data || []).flatMap(client => [client.id, client.client_code, client.legal_name]));
  return { data: (workspace.data || []).map(row => ({ ...row, payload: scopedWorkspace(row.scope, row.payload, allowed, actor.profile.id, leadership) })) };
}
