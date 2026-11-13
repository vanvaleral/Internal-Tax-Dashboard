import { NextResponse } from "next/server";
import { currentActor, isLeadership } from "@/lib/access";
import { CLIENT_BULK_COLUMNS, CLIENT_BULK_FIELDS, parseClientBulkChanges } from "@/lib/client-bulk-edit";

type BulkRecord = Record<string, unknown> & { id: string; client_code: string; legal_name: string; updated_at: string; status: string };

export async function GET(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Leadership access is required for Bulk Edit." }, { status: 403 });
  const staff = await actor.admin.from("staff_profiles").select("id, display_name, full_name");
  if (staff.error) return NextResponse.json({ error: "PIC names could not be verified. Retry loading the sheet." }, { status: 503 });
  const names = new Map((staff.data || []).map(person => [person.id, person.display_name || person.full_name]));
  const canonical = (row: Record<string, any>, kind: string) => {
    const byId = names.get(row[`${kind}_pic_profile_id`]);
    if (byId) return byId;
    const original = String(row[`${kind}_pic_name`] || "").trim();
    const found = (staff.data || []).filter(person => [person.display_name, person.full_name].some(name => String(name || "").trim().toLowerCase() === original.toLowerCase()));
    return found.length === 1 ? found[0].display_name || found[0].full_name : original;
  };
  const rows = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const { data, error } = await actor.admin.from("client_master").select(CLIENT_BULK_COLUMNS).in("status", ["Active", "Inactive"]).order("id").range(offset, offset + 999);
    if (error) return NextResponse.json({ error: "Client data could not be loaded. Retry without discarding pending changes." }, { status: 503 });
    rows.push(...((data || []) as unknown as Record<string, any>[]).map(row => ({ ...row, tax_pic_name: canonical(row, "tax"), accounting_pic_name: canonical(row, "accounting") })));
    if ((data || []).length < 1000) return NextResponse.json({ data: rows, fields: CLIENT_BULK_FIELDS }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "Too many clients for this editor. Use smaller imports instead." }, { status: 413 });
}

export async function POST(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Leadership access is required for Bulk Edit." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!["review", "save"].includes(body.operation)) return NextResponse.json({ error: "Review changes before saving." }, { status: 400 });
  let changes;
  try { changes = parseClientBulkChanges(body.clients); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 422 }); }
  if (body.operation === "save" && !Array.isArray(body.expectedMatches)) return NextResponse.json({ error: "Review the pending changes before saving." }, { status: 422 });
  const savedRows: BulkRecord[] = [];
  for (let offset = 0; offset < changes.length; offset += 100) {
    const { data, error } = await actor.admin.from("client_master").select(CLIENT_BULK_COLUMNS).in("id", changes.slice(offset, offset + 100).map(row => row.id));
    if (error) return NextResponse.json({ error: "Client versions could not be checked. No changes were saved." }, { status: 503 });
    savedRows.push(...(data || []) as unknown as BulkRecord[]);
  }
  const records = new Map(savedRows.map(row => [row.id, row]));
  if (changes.some(change => !records.has(change.id) || records.get(change.id)!.updated_at !== change.expectedUpdatedAt || !["Active", "Inactive"].includes(records.get(change.id)!.status))) {
    return NextResponse.json({ error: "A client changed since this sheet was loaded. Pending edits are kept; discard and reload to review the current data.", code: "VERSION_CONFLICT" }, { status: 409 });
  }
  const payload = changes.map(change => ({ client_code: records.get(change.id)!.client_code, legal_name: records.get(change.id)!.legal_name, ...change.changes }));
  const matched = await actor.admin.rpc("match_client_master_import", { p_rows: payload });
  if (matched.error) return NextResponse.json({ error: "Client identity checks are unavailable. No changes were saved." }, { status: 503 });
  const matches = matched.data?.matches || [];
  if (matches.length !== changes.length || matches.some((match: any, index: number) => match.clientId !== changes[index].id || match.updatedAt !== changes[index].expectedUpdatedAt || match.action !== "update")) {
    return NextResponse.json({ error: "Client identity or version changed. Reload and review before saving.", code: "VERSION_CONFLICT" }, { status: 409 });
  }
  if (matches.some((match: any) => match.errors?.length)) return NextResponse.json({ error: "Conflicting client identity. Correct these rows before saving.", validation: matches }, { status: 422 });
  if (body.operation === "review") {
    const review = changes.map(change => ({ id: change.id, clientCode: records.get(change.id)!.client_code, name: records.get(change.id)!.legal_name,
      fields: Object.entries(change.changes).map(([key, after]) => ({ key, label: CLIENT_BULK_FIELDS.find(field => field.key === key)!.label, before: records.get(change.id)![key], after })) }));
    return NextResponse.json({ review, expectedMatches: matches }, { headers: { "Cache-Control": "no-store" } });
  }
  // Reuse the locked import transaction for updates only, including its existing audit trail.
  const result = await actor.admin.rpc("commit_matched_client_import", { p_rows: payload, p_expected_matches: body.expectedMatches,
    p_actor_user_id: actor.userId, p_actor_profile_id: actor.profile.id, p_file_name: "Clients / Bulk Edit (no uploaded file)", p_file_sha256: null });
  if (result.error) return NextResponse.json({ error: result.error.code === "40001" ? "Client data changed since review. Discard and reload before saving." : "The entire batch was not saved. Your pending edits are kept for retry.", code: result.error.code === "40001" ? "VERSION_CONFLICT" : "SAVE_FAILED" }, { status: result.error.code === "40001" ? 409 : 503 });
  return NextResponse.json({ updated: Number(result.data?.updated || 0), data: result.data?.data || [] }, { headers: { "Cache-Control": "no-store" } });
}
