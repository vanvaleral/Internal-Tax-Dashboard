import { NextResponse } from "next/server";
import { canImportClientMaster, currentActor, type CurrentActor } from "@/lib/access";
import { findDuplicateClientGroups } from "@/lib/client-import";

async function deleteDuplicateCopies(
  actor: CurrentActor,
  canonicalId: string,
  duplicateIds: string[]
) {
  const { data: rows, error: lookupError } = await actor.admin.from("client_master").select("*").in("id", [canonicalId, ...duplicateIds]);
  if (lookupError || (rows || []).length !== duplicateIds.length + 1) throw new Error(lookupError?.message || "One or more client records could not be found.");
  const canonical = rows?.find((row) => row.id === canonicalId);
  const { data: activities, error: activityLookupError } = await actor.admin.from("client_master_activity").select("*").in("client_id", duplicateIds);
  if (activityLookupError) throw new Error(activityLookupError.message);
  const { error: snapshotError } = await actor.admin.from("client_master_duplicate_trash").insert(duplicateIds.map((id) => ({
    original_client_id: id,
    canonical_client_id: canonicalId,
    client_record: rows?.find((row) => row.id === id),
    activity_records: (activities || []).filter((activity) => activity.client_id === id),
    deleted_by_profile_id: actor.profile.id
  })));
  if (snapshotError) throw new Error(snapshotError.message);
  const { error } = await actor.admin.from("client_master").delete().in("id", duplicateIds);
  if (error) throw new Error(error.message);
  return { deleted: duplicateIds.length, canonical: canonical?.client_code };
}

type DuplicateDeletePlan = { canonicalId: string; duplicateIds: string[] };

async function deleteDuplicateBatch(actor: CurrentActor, plans: DuplicateDeletePlan[]) {
  const validPlans = plans
    .map((plan) => ({ canonicalId: String(plan.canonicalId || ""), duplicateIds: [...new Set((plan.duplicateIds || []).map(String))].filter((id) => id && id !== String(plan.canonicalId || "")) }))
    .filter((plan) => plan.canonicalId && plan.duplicateIds.length);
  const duplicateIds = [...new Set(validPlans.flatMap((plan) => plan.duplicateIds))];
  const allIds = [...new Set([...validPlans.map((plan) => plan.canonicalId), ...duplicateIds])];
  if (!validPlans.length || !duplicateIds.length) throw new Error("Select one client to keep and at least one duplicate to delete.");

  const { data: rows, error: lookupError } = await actor.admin.from("client_master").select("*").in("id", allIds);
  if (lookupError || (rows || []).length !== allIds.length) throw new Error(lookupError?.message || "One or more client records could not be found.");
  const { data: activities, error: activityLookupError } = await actor.admin.from("client_master_activity").select("*").in("client_id", duplicateIds);
  if (activityLookupError) throw new Error(activityLookupError.message);
  const canonicalByDuplicateId = new Map(validPlans.flatMap((plan) => plan.duplicateIds.map((id) => [id, plan.canonicalId])));
  const { error: snapshotError } = await actor.admin.from("client_master_duplicate_trash").upsert(duplicateIds.map((id) => ({
    original_client_id: id,
    canonical_client_id: canonicalByDuplicateId.get(id),
    client_record: rows?.find((row) => row.id === id),
    activity_records: (activities || []).filter((activity) => activity.client_id === id),
    deleted_by_profile_id: actor.profile.id
  })), { onConflict: "original_client_id" });
  if (snapshotError) throw new Error(snapshotError.message);
  const { error: deleteError } = await actor.admin.from("client_master").delete().in("id", duplicateIds);
  if (deleteError) throw new Error(deleteError.message);
  return { deleted: duplicateIds.length, groups: validPlans.length };
}

export async function GET() {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!canImportClientMaster(actor.profile.role)) return NextResponse.json({ error: "Only a Supervisor or Leader can review duplicate clients." }, { status: 403 });
  const { data, error } = await actor.admin.from("client_master").select("id, client_code, legal_name, npwp, status, created_at").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const groups = findDuplicateClientGroups((data || []).map((client) => ({ id: client.id, clientCode: client.client_code, name: client.legal_name, npwp: client.npwp, createdAt: client.created_at })))
    .map((group) => ({ ...group, clients: group.clients.map((client) => ({ ...client, status: data?.find((row) => row.id === client.id)?.status || "Active" })) }));
  return NextResponse.json({ groups });
}

export async function PATCH(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!canImportClientMaster(actor.profile.role)) return NextResponse.json({ error: "Only a Supervisor or Leader can resolve duplicate clients." }, { status: 403 });
  const body = await request.json();
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
