import { NextResponse } from "next/server";
import { currentActor } from "@/lib/access";
import { canManageAccess } from "@/lib/feature-access";
import { readAllPages } from "@/lib/read-all-pages";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!canManageAccess(actor.profile.role)) return NextResponse.json({ error: "You cannot view Deleted Clients." }, { status: 403 });
  try {
    const data = await readAllPages((from, to) => actor.admin.from("client_master")
      .select("id, client_code, legal_name, updated_at", { count: "exact" }).eq("status", "Deleted")
      .order("updated_at", { ascending: false }).order("id").range(from, to));
    return NextResponse.json({ data }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "Deleted Clients could not be loaded. Try again." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!canManageAccess(actor.profile.role)) return NextResponse.json({ error: "Only a Supervisor, Partner or Admin can delete or restore clients." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.id) ||
      typeof body.updatedAt !== "string" || !Number.isFinite(Date.parse(body.updatedAt)) ||
      !["delete", "restore"].includes(body.action)) {
    return NextResponse.json({ error: "Select a saved client and a valid action." }, { status: 400 });
  }
  const { data, error } = await actor.admin.rpc("set_client_master_deleted", {
    p_client_id: body.id, p_expected_updated_at: body.updatedAt, p_deleted: body.action === "delete",
    p_actor_profile_id: actor.profile.id, p_actor_user_id: actor.userId
  });
  if (error) {
    const status = ({ "42501": 403, "P0002": 404, "40001": 409 } as Record<string, number>)[error.code];
    return NextResponse.json({ error: status ? error.message : "The client change could not be saved. Try again or ask a Supervisor to check the database setup." }, { status: status || 503 });
  }
  if (!data?.id) return NextResponse.json({ error: "The change could not be confirmed. Refresh Clients before retrying." }, { status: 503 });
  return NextResponse.json({ data }, { headers: privateHeaders });
}
