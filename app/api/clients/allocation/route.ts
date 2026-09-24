import { NextResponse } from "next/server";
import { currentActor, isLeadership } from "@/lib/access";
import { asSafeText } from "@/lib/client-import";

type AllocationChange = {
  clientCode?: unknown;
  nextTaxPic?: unknown;
  nextAccPic?: unknown;
};

export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Only leadership can apply PIC allocation changes." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const allocationYear = Number(body.allocationYear);
  const changes: AllocationChange[] = Array.isArray(body.changes) ? body.changes : [];
  if (!Number.isInteger(allocationYear) || allocationYear < 2000 || allocationYear > 2200) return NextResponse.json({ error: "Allocation year is invalid." }, { status: 400 });
  if (!changes.length) return NextResponse.json({ error: "No allocation changes supplied." }, { status: 400 });

  const codes = [...new Set(changes.map((change) => asSafeText(change.clientCode)).filter(Boolean))];
  const [clientsResult, staffResult] = await Promise.all([
    actor.admin.from("client_master").select("id, client_code").in("client_code", codes),
    actor.admin.from("staff_profiles").select("id, display_name, full_name").eq("directory_active", true)
  ]);
  if (clientsResult.error) return NextResponse.json({ error: clientsResult.error.message }, { status: 500 });
  if (staffResult.error) return NextResponse.json({ error: staffResult.error.message }, { status: 500 });

  const clientsByCode = new Map((clientsResult.data || []).map((client) => [client.client_code, client.id]));
  const staffByName = new Map<string, string[]>();
  const staffLabelById = new Map<string, string>();
  for (const staff of staffResult.data || []) for (const label of [staff.display_name, staff.full_name]) {
    const key = asSafeText(label).toLowerCase();
    if (key) staffByName.set(key, [...(staffByName.get(key) || []), staff.id]);
    staffLabelById.set(staff.id, asSafeText(staff.display_name) || asSafeText(staff.full_name));
  }
  const resolveStaff = (name: string) => [...new Set(staffByName.get(name.toLowerCase()) || [])];
  const errors: string[] = [];
  const payload = changes.map((change) => {
    const clientCode = asSafeText(change.clientCode);
    const taxName = asSafeText(change.nextTaxPic);
    const accName = asSafeText(change.nextAccPic);
    const taxIds = resolveStaff(taxName);
    const accIds = resolveStaff(accName);
    if (!clientsByCode.has(clientCode)) errors.push(`${clientCode || "Unknown client"}: client was not found.`);
    if (taxIds.length !== 1) errors.push(`${clientCode}: Tax PIC must match one active staff profile.`);
    if (accIds.length !== 1) errors.push(`${clientCode}: ACC PIC must match one active staff profile.`);
    return {
      client_id: clientsByCode.get(clientCode),
      tax_pic_profile_id: taxIds[0], tax_pic_name: staffLabelById.get(taxIds[0]) || taxName,
      accounting_pic_profile_id: accIds[0], accounting_pic_name: staffLabelById.get(accIds[0]) || accName
    };
  });
  if (errors.length) return NextResponse.json({ error: "Allocation validation failed.", details: errors }, { status: 422 });

  const { data, error } = await actor.admin.rpc("apply_client_pic_allocation_batch", {
    p_changes: payload,
    p_allocation_year: allocationYear,
    p_changed_by_profile_id: actor.profile.id
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: Number(data || 0), allocationYear });
}
