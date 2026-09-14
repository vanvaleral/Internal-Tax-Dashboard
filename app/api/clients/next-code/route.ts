import { NextResponse } from "next/server";
import { currentActor, isLeadership } from "@/lib/access";

export async function POST() {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Only leadership can allocate a client code." }, { status: 403 });
  const { data, error } = await actor.admin.rpc("allocate_client_code");
  if (error || !data) return NextResponse.json({ error: error?.message || "Could not allocate a client code." }, { status: 500 });
  return NextResponse.json({ clientCode: data });
}
