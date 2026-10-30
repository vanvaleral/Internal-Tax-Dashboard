import { isLeadership, type CurrentActor } from "@/lib/access";
import { scopedWorkspace } from "@/lib/workspace-security";

export async function readStaff(actor: CurrentActor, includeInactive = false) {
  let query = actor.admin.from("staff_profiles").select("*").order("display_name");
  if (!includeInactive) query = query.eq("directory_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { staff: (data || []).map(profile => {
    const base = { id: profile.id, full_name: profile.full_name, display_name: profile.display_name || profile.full_name, team_division: profile.team_division, role: profile.role };
    return isLeadership(actor.profile.role)
      ? { ...base, employment_title: profile.employment_title || null, auth_user_id: profile.auth_user_id || null, claimed_at: profile.claimed_at || null, directory_active: profile.directory_active !== false, archived_at: profile.archived_at || null, access_deletion_started_at: profile.access_deletion_started_at || null, access_deleted_at: profile.access_deleted_at || null }
      : base;
  }) };
}

export async function readClients(actor: CurrentActor, params = new URLSearchParams()) {
  const search = params.get("search")?.trim();
  const limit = Math.min(Math.max(Number(params.get("limit") || 500), 1), 1000);
  const offset = Math.max(Number(params.get("offset") || 0), 0);
  let query = actor.admin.from("client_master").select("*", { count: "exact" }).order("legal_name").range(offset, offset + limit - 1);
  if (!isLeadership(actor.profile.role)) query = query.or(`tax_pic_profile_id.eq.${actor.profile.id},accounting_pic_profile_id.eq.${actor.profile.id}`);
  if (search) query = query.or(`legal_name.ilike.%${search}%,client_code.ilike.%${search}%,npwp.ilike.%${search}%`);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const feeAccess = isLeadership(actor.profile.role);
  return { data: feeAccess ? data || [] : (data || []).map(client => Object.fromEntries(Object.entries(client).filter(([key]) => !["monthly_fee", "annual_fee", "fee_notes"].includes(key)))), count, mode: "database", feeAccess };
}

export async function readCases(actor: CurrentActor, includeDeleted = false) {
  let query = actor.admin.from("tax_cases").select("*").order("updated_at", { ascending: false });
  if (includeDeleted) {
    query = query.not("deleted_at", "is", null);
    if (!isLeadership(actor.profile.role)) query = query.eq("deleted_by_profile_id", actor.profile.id);
  } else {
    query = query.is("deleted_at", null);
    if (!isLeadership(actor.profile.role)) query = query.or(`tax_pic_profile_id.eq.${actor.profile.id},accounting_pic_profile_id.eq.${actor.profile.id}`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { data: data || [] };
}

export async function readOperations(actor: CurrentActor, scope: string | null) {
  let query = actor.admin.from("operational_workspace_state").select("scope, payload, version, updated_at");
  if (scope && ["monthly_compliance", "annual_accounting", "annual_tax"].includes(scope)) query = query.eq("scope", scope);
  const leadership = isLeadership(actor.profile.role);
  const [workspace, clients] = await Promise.all([
    query,
    leadership ? Promise.resolve({ data: [], error: null })
      : actor.admin.from("client_master").select("id, client_code, legal_name").or(`tax_pic_profile_id.eq.${actor.profile.id},accounting_pic_profile_id.eq.${actor.profile.id}`)
  ]);
  if (workspace.error || clients.error) throw new Error(workspace.error?.message || clients.error?.message);
  const allowed = new Set((clients.data || []).flatMap(client => [client.id, client.client_code, client.legal_name]));
  return { data: (workspace.data || []).map(row => ({ ...row, payload: scopedWorkspace(row.scope, row.payload, allowed, actor.profile.id, leadership) })) };
}
