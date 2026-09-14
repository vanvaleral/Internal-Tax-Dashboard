import { NextResponse } from "next/server";
import { canImportClientMaster, currentActor, type CurrentActor } from "@/lib/access";
import { findDuplicateClientGroups } from "@/lib/client-import";

async function archiveDuplicateCopies(
  actor: CurrentActor,
  canonicalId: string,
  duplicateIds: string[]
) {
  const { data: rows, error: lookupError } = await actor.admin.from("client_master").select("id, client_code, legal_name").in("id", [canonicalId, ...duplicateIds]);
  if (lookupError || (rows || []).length !== duplicateIds.length + 1) throw new Error(lookupError?.message || "One or more client records could not be found.");
  const canonical = rows?.find((row) => row.id === canonicalId);
  const { error } = await actor.admin.from("client_master").update({ status: "Inactive", duplicate_of_client_id: canonicalId }).in("id", duplicateIds);
  if (error) throw new Error(error.message);
  const { error: auditError } = await actor.admin.from("client_master_activity").insert(duplicateIds.map((id) => ({ client_id: id, action: "client_marked_duplicate", previous_value: null, new_value: { duplicate_of_client_id: canonicalId, canonical_client_code: canonical?.client_code }, actor_user_id: actor.userId })));
  if (auditError) console.error("[client duplicates] audit could not be written", auditError);
  return { archived: duplicateIds.length, canonical: canonical?.client_code };
}

export async function GET() {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!canImportClientMaster(actor.profile.role)) return NextResponse.json({ error: "Only a Supervisor or Leader can review duplicate clients." }, { status: 403 });
  const { data, error } = await actor.admin.from("client_master").select("id, client_code, legal_name, npwp, status, created_at, duplicate_of_client_id").is("duplicate_of_client_id", null).order("created_at");
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
    const { data, error } = await actor.admin.from("client_master").select("id, client_code, legal_name, npwp, created_at").is("duplicate_of_client_id", null).order("created_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const groups = findDuplicateClientGroups((data || []).map((client) => ({ id: client.id, clientCode: client.client_code, name: client.legal_name, npwp: client.npwp, createdAt: client.created_at })));
    let archived = 0;
    try {
      for (const group of groups) {
        const orderedClients = keep === "newest" ? [...group.clients].reverse() : group.clients;
        const canonicalId = String(orderedClients[0]?.id || "");
        const duplicateIds = orderedClients.slice(1).map((client) => String(client.id)).filter(Boolean);
        if (canonicalId && duplicateIds.length) archived += (await archiveDuplicateCopies(actor, canonicalId, duplicateIds)).archived;
      }
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Duplicate cleanup could not be completed." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, groups: groups.length, archived });
  }
  const canonicalId = String(body.canonicalId || "");
  const duplicateIds: string[] = [...new Set<string>(Array.isArray(body.duplicateIds) ? body.duplicateIds.map(String) : [])].filter((id) => id && id !== canonicalId);
  if (!canonicalId || !duplicateIds.length) return NextResponse.json({ error: "Select one client to keep and at least one duplicate to archive." }, { status: 400 });
  try { return NextResponse.json({ ok: true, ...(await archiveDuplicateCopies(actor, canonicalId, duplicateIds)) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Duplicate cleanup could not be completed." }, { status: 500 }); }
}
