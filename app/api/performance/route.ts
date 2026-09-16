import { NextResponse } from "next/server";
import { currentActor, isLeadership } from "@/lib/access";

export async function GET(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const period = new URL(request.url).searchParams.get("period");
  const data: any[] = [];
  for (let from = 0; ; from += 500) {
    let query = actor.admin.from("performance_point_ledger").select("*, staff:staff_profiles!performance_point_ledger_staff_profile_id_fkey(display_name, full_name, team_division)").order("created_at", { ascending: false }).range(from, from + 499);
    if (!isLeadership(actor.profile.role)) query = query.eq("staff_profile_id", actor.profile.id);
    if (period) query = query.eq("period_key", period);
    const page = await query;
    if (page.error) return NextResponse.json({ error: page.error.message }, { status: 500 });
    data.push(...(page.data || []));
    if ((page.data || []).length < 500) break;
  }
  const { data: publications, error: publicationError } = await actor.admin.from("performance_publications").select("period_key, snapshot, published_at").order("published_at", { ascending: false }).limit(120);
  if (publicationError) return NextResponse.json({ error: publicationError.message }, { status: 500 });
  return NextResponse.json({ data, publications: publications || [] });
}

export async function PATCH(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Only leadership can publish performance results." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const periodKey = String(body.periodKey || "").trim();
  const snapshot = body.snapshot && typeof body.snapshot === "object" ? body.snapshot : null;
  if (!/^\d{4}-\d{2}$/.test(periodKey) || !snapshot || !String(snapshot.winnerPic || "").trim() || !Number.isFinite(Number(snapshot.winnerPoints))) {
    return NextResponse.json({ error: "A valid period and winner snapshot are required." }, { status: 400 });
  }
  const { data, error } = await actor.admin.from("performance_publications").upsert({ period_key: periodKey, snapshot, published_by_profile_id: actor.profile.id, published_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "period_key" }).select("period_key, snapshot, published_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Only leadership can create manual point adjustments." }, { status: 403 });
  const body = await request.json();
  const points = Number(body.points);
  const sourceKey = String(body.sourceKey || "").trim();
  const sourceType = String(body.sourceType || "").trim();
  const periodKey = String(body.periodKey || "").trim();
  if (!sourceKey || !sourceType || !periodKey || !Number.isFinite(points) || points < -1000 || points > 1000) return NextResponse.json({ error: "Invalid achievement event." }, { status: 400 });
  const staffProfileId = String(body.staffProfileId || "").trim();
  if (!staffProfileId || sourceType !== "manual_adjustment") return NextResponse.json({ error: "Manual adjustments require a target staff profile." }, { status: 400 });
  const { data, error } = await actor.admin.from("performance_point_ledger").insert({ staff_profile_id: staffProfileId, period_key: periodKey, source_type: sourceType, source_key: sourceKey, event_type: String(body.eventType || "adjustment"), points, status: "pending", metadata: { submitted_by: actor.profile.id, reason: String(body.reason || "") } }).select("*").single();
  if (error?.code === "23505") return NextResponse.json({ data: null, duplicate: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
