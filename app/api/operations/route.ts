import { NextResponse } from "next/server";
import { currentActor, isLeadership } from "@/lib/access";

const scopes = new Set(["monthly_compliance", "annual_accounting", "annual_tax"]);

function clientIdentifier(row: Record<string, unknown>) {
  return String(row.databaseId || row.clientId || row.client_id || row.clientCode || row.clientName || row.name || "").trim();
}

function filterPayload(payload: unknown, allowed: Set<string>, leadership: boolean) {
  if (leadership || !payload || typeof payload !== "object") return payload;
  const value = payload as Record<string, unknown>;
  const filterRows = (rows: unknown) => Array.isArray(rows)
    ? rows.filter((row) => row && typeof row === "object" && allowed.has(clientIdentifier(row as Record<string, unknown>)))
    : rows;
  if (Array.isArray(value)) return filterRows(value);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, filterRows(item)]));
}

export async function GET(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const scope = new URL(request.url).searchParams.get("scope");
  let query = actor.admin.from("operational_workspace_state").select("scope, payload, version, updated_at");
  if (scope && scopes.has(scope)) query = query.eq("scope", scope);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (isLeadership(actor.profile.role)) return NextResponse.json({ data: data || [] });
  const { data: clients, error: clientsError } = await actor.admin.from("client_master").select("id, client_code, legal_name").or(`tax_pic_profile_id.eq.${actor.profile.id},accounting_pic_profile_id.eq.${actor.profile.id}`);
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });
  const allowed = new Set((clients || []).flatMap((client) => [client.id, client.client_code, client.legal_name]));
  return NextResponse.json({ data: (data || []).map((row) => ({ ...row, payload: filterPayload(row.payload, allowed, false) })) });
}

export async function PUT(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json();
  const scope = String(body.scope || "");
  const version = Number(body.version || 0);
  if (!scopes.has(scope) || !body.payload || typeof body.payload !== "object") return NextResponse.json({ error: "A valid scope and payload are required." }, { status: 400 });
  const { data: current, error: currentError } = await actor.admin.from("operational_workspace_state").select("payload, version").eq("scope", scope).maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
  if (current && version !== current.version) return NextResponse.json({ error: "This workspace changed in another session. Reload the latest data before retrying.", code: "VERSION_CONFLICT", latest: current }, { status: 409 });
  let payload = body.payload;
  if (!isLeadership(actor.profile.role)) {
    const { data: clients, error } = await actor.admin.from("client_master").select("id, client_code, legal_name").or(`tax_pic_profile_id.eq.${actor.profile.id},accounting_pic_profile_id.eq.${actor.profile.id}`);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const allowed = new Set((clients || []).flatMap((client) => [client.id, client.client_code, client.legal_name]));
    payload = filterPayload(payload, allowed, false);
  }
  const nextVersion = (current?.version || 0) + 1;
  const { data, error } = await actor.admin.from("operational_workspace_state").upsert({ scope, payload, version: nextVersion, updated_by_profile_id: actor.profile.id, updated_at: new Date().toISOString() }, { onConflict: "scope" }).select("scope, payload, version, updated_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await actor.admin.from("operational_workspace_audit").insert({ scope, version: nextVersion, actor_profile_id: actor.profile.id, action: "updated" });
  return NextResponse.json({ data });
}
