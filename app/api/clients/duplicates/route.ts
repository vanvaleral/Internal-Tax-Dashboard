import { NextResponse } from "next/server";
import { canImportClientMaster, currentActor, type CurrentActor } from "@/lib/access";
import { findDuplicateClientGroups } from "@/lib/client-import";

async function deleteDuplicateCopies(
  actor: CurrentActor,
  canonicalId: string,
  duplicateIds: string[]
) {
  return mergeDuplicateBatch(actor, [{ canonicalId, duplicateIds }]);
}

type DuplicateDeletePlan = { canonicalId: string; duplicateIds: string[] };

async function deleteDuplicateBatch(actor: CurrentActor, plans: DuplicateDeletePlan[]) {
  const validPlans = plans
    .map((plan) => ({ canonicalId: String(plan.canonicalId || ""), duplicateIds: [...new Set((plan.duplicateIds || []).map(String))].filter((id) => id && id !== String(plan.canonicalId || "")) }))
    .filter((plan) => plan.canonicalId && plan.duplicateIds.length);
  const duplicateIds = [...new Set(validPlans.flatMap((plan) => plan.duplicateIds))];
  if (!validPlans.length || !duplicateIds.length) throw new Error("Select one client to keep and at least one duplicate to delete.");
  return mergeDuplicateBatch(actor, validPlans);
}

async function mergeDuplicateBatch(actor: CurrentActor, plans: DuplicateDeletePlan[]) {
  const { data, error } = await actor.admin.rpc("merge_duplicate_clients", { p_plans: plans, p_actor_profile_id: actor.profile.id });
  if (error) throw new Error(error.message);
  return data as { deleted: number; groups: number };
}

export async function GET() {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!canImportClientMaster(actor.profile.role)) return NextResponse.json({ error: "Only a Supervisor or Leader can review duplicate clients." }, { status: 403 });
  const { data, error } = await actor.admin.from("client_master").select("id, client_code, legal_name, npwp, status, created_at").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (data || []).map((client) => client.id);
  const [cases, claims, activities] = ids.length ? await Promise.all([
    actor.admin.from("tax_cases").select("client_id").in("client_id", ids),
    actor.admin.from("monthly_tax_claims").select("client_id").in("client_id", ids),
    actor.admin.from("client_master_activity").select("client_id").in("client_id", ids)
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const countFor = (rows: Array<{ client_id?: string }> | null | undefined, id: string) => (rows || []).filter((row) => row.client_id === id).length;
  const groups = findDuplicateClientGroups((data || []).map((client) => ({ id: client.id, clientCode: client.client_code, name: client.legal_name, npwp: client.npwp, createdAt: client.created_at })))
    .map((group) => ({ ...group, clients: group.clients.map((client) => ({
      ...client,
      status: data?.find((row) => row.id === client.id)?.status || "Active",
      dependencies: { cases: countFor(cases.data, String(client.id || "")), claims: countFor(claims.data, String(client.id || "")), activities: countFor(activities.data, String(client.id || "")) }
    })) }));
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recoveryRows } = await actor.admin.from("client_master_duplicate_trash")
    .select("original_client_id, canonical_client_id, client_record, relationship_records, deleted_at")
    .gte("deleted_at", cutoff).order("deleted_at", { ascending: false }).limit(100);
  const recoveries = (recoveryRows || []).map((row) => ({
    originalClientId: row.original_client_id,
    canonicalClientId: row.canonical_client_id,
    clientCode: row.client_record?.client_code || "",
    name: row.client_record?.legal_name || "Unknown client",
    deletedAt: row.deleted_at,
    dependencies: row.relationship_records || {}
  }));
  return NextResponse.json({ groups, recoveries });
}

export async function PATCH(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!canImportClientMaster(actor.profile.role)) return NextResponse.json({ error: "Only a Supervisor or Leader can resolve duplicate clients." }, { status: 403 });
  const body = await request.json();
  if (body.action === "restore") {
    const originalClientId = String(body.originalClientId || "");
    if (!originalClientId) return NextResponse.json({ error: "Recovery client ID is required." }, { status: 400 });
    const { data, error } = await actor.admin.rpc("restore_merged_client", { p_original_client_id: originalClientId, p_actor_profile_id: actor.profile.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ ok: true, ...data });
  }
  if (body.action === "resolve-all") {
    const keep = body.keep === "newest" ? "newest" : body.keep === "oldest" ? "oldest" : "";
    if (!keep) return NextResponse.json({ error: "Choose whether to retain the oldest or newest record in each duplicate group." }, { status: 400 });
    const { data, error } = await actor.admin.from("client_master").select("id, client_code, legal_name, npwp, created_at").order("created_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const groups = findDuplicateClientGroups((data || []).map((client) => ({ id: client.id, clientCode: client.client_code, name: client.legal_name, npwp: client.npwp, createdAt: client.created_at })));
    try {
      const plans = groups.map((group) => {
        const orderedClients = keep === "newest" ? [...group.clients].reverse() : group.clients;
        return { canonicalId: String(orderedClients[0]?.id || ""), duplicateIds: orderedClients.slice(1).map((client) => String(client.id)).filter(Boolean) };
      });
      const result = await deleteDuplicateBatch(actor, plans);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Duplicate cleanup could not be completed." }, { status: 500 });
    }
  }
  if (body.action === "resolve-batch") {
    const plans = Array.isArray(body.actions) ? body.actions : [];
    try { return NextResponse.json({ ok: true, ...(await deleteDuplicateBatch(actor, plans)) }); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Duplicate cleanup could not be completed." }, { status: 500 }); }
  }
  const canonicalId = String(body.canonicalId || "");
  const duplicateIds: string[] = [...new Set<string>(Array.isArray(body.duplicateIds) ? body.duplicateIds.map(String) : [])].filter((id) => id && id !== canonicalId);
  if (!canonicalId || !duplicateIds.length) return NextResponse.json({ error: "Select one client to keep and at least one duplicate to delete." }, { status: 400 });
  try { return NextResponse.json({ ok: true, ...(await deleteDuplicateCopies(actor, canonicalId, duplicateIds)) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Duplicate cleanup could not be completed." }, { status: 500 }); }
}
