import { NextResponse } from "next/server";
import { canImportClientMaster, currentActor } from "@/lib/access";
import { findDuplicateClientGroups } from "@/lib/client-import";

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
  const canonicalId = String(body.canonicalId || "");
  const duplicateIds = [...new Set(Array.isArray(body.duplicateIds) ? body.duplicateIds.map(String) : [])].filter((id) => id && id !== canonicalId);
  if (!canonicalId || !duplicateIds.length) return NextResponse.json({ error: "Select one client to keep and at least one duplicate to archive." }, { status: 400 });

  const { data: rows, error: lookupError } = await actor.admin.from("client_master").select("id, client_code, legal_name").in("id", [canonicalId, ...duplicateIds]);
  if (lookupError || (rows || []).length !== duplicateIds.length + 1) return NextResponse.json({ error: lookupError?.message || "One or more client records could not be found." }, { status: 404 });
  const canonical = rows?.find((row) => row.id === canonicalId);
  const { error } = await actor.admin.from("client_master").update({ status: "Inactive", duplicate_of_client_id: canonicalId }).in("id", duplicateIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: auditError } = await actor.admin.from("client_master_activity").insert(duplicateIds.map((id) => ({ client_id: id, action: "client_marked_duplicate", previous_value: null, new_value: { duplicate_of_client_id: canonicalId, canonical_client_code: canonical?.client_code }, actor_user_id: actor.userId })));
  if (auditError) console.error("[client duplicates] audit could not be written", auditError);
  return NextResponse.json({ ok: true, archived: duplicateIds.length, canonical: canonical?.client_code });
}
