import { NextResponse } from "next/server";
import { currentActor, isLeadership } from "@/lib/access";
import { validateEngagementChange } from "@/lib/client-engagement";

export async function POST(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Leadership access is required to change client engagements." }, { status: 403 });
  const body = await request.json().catch(() => null);
  let clients;
  try { clients = validateEngagementChange(body); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const { data, error } = await actor.admin.rpc("move_client_engagement_batch", { changes: clients, target_type: body.engagementType, actor_id: actor.profile.id });
  if (error) return NextResponse.json({ error: error.code === "40001" ? "A selected client's engagement changed. Refresh and review the selection." : "Clients could not be moved. Verify the engagement migration is installed.", code: error.code === "40001" ? "VERSION_CONFLICT" : "SAVE_FAILED" }, { status: error.code === "40001" ? 409 : 503 });
  return NextResponse.json({ updated: data }, { headers: { "Cache-Control": "no-store" } });
}
