import { NextResponse } from "next/server";
import { currentActor, isLeadership } from "@/lib/access";

export async function GET(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const period = new URL(request.url).searchParams.get("period");
  let query = actor.admin.from("performance_point_ledger").select("*").order("created_at", { ascending: false });
  if (!isLeadership(actor.profile.role)) query = query.eq("staff_profile_id", actor.profile.id);
  if (period) query = query.eq("period_key", period);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json();
  const points = Number(body.points);
  const sourceKey = String(body.sourceKey || "").trim();
  const sourceType = String(body.sourceType || "").trim();
  const periodKey = String(body.periodKey || "").trim();
  if (!sourceKey || !sourceType || !periodKey || !Number.isFinite(points) || points < -1000 || points > 1000) return NextResponse.json({ error: "Invalid achievement event." }, { status: 400 });
  const { data, error } = await actor.admin.from("performance_point_ledger").insert({ staff_profile_id: actor.profile.id, period_key: periodKey, source_type: sourceType, source_key: sourceKey, event_type: String(body.eventType || "completed"), points, status: "pending", metadata: { submitted_by: actor.profile.id } }).select("*").single();
  if (error?.code === "23505") return NextResponse.json({ data: null, duplicate: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
