import { NextResponse } from "next/server";
import { currentActor, isLeadership, type CurrentActor } from "@/lib/access";
import { canUseFeature, readFeatureSettings } from "@/lib/feature-access";
import { buildMonthlyLeadershipReport, followUpWatch, monthBounds, reportMonth, type ReportEvent } from "@/lib/monthly-leadership-report";
import { readAllPages } from "@/lib/read-all-pages";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const snapshotFields = "period,snapshot,finalized_at,finalized_by_name";
const caseFields = "id,client_name,case_category,created_at,closed_at,deleted_at,stage,tax_pic_profile_id,accounting_pic_profile_id,case_workflow";

async function allowed(actor: CurrentActor) {
  if (!isLeadership(actor.profile.role)) return false;
  const settings = await readFeatureSettings(actor.admin);
  return canUseFeature(actor.profile.role, settings.policy, "management");
}

function directory(actor: CurrentActor) {
  return readAllPages((from, to) => actor.admin.from("staff_profiles")
    .select("id,display_name,full_name,directory_active", { count: "exact" }).order("id").range(from, to));
}

async function caseEvents(actor: CurrentActor, start: string, end: string): Promise<ReportEvent[]> {
  const [notes, tasks] = await Promise.all([
    readAllPages((from, to) => actor.admin.from("tax_case_progress_entries")
      .select("id,case_id,created_by_profile_id,created_at,entry", { count: "exact" })
      .gte("created_at", start).lt("created_at", end).order("created_at").order("id").range(from, to)),
    readAllPages((from, to) => actor.admin.from("tax_case_task_timeline")
      .select("id,case_id,actor_profile_id,occurred_at,step_title,title,event_type", { count: "exact" })
      .gte("occurred_at", start).lt("occurred_at", end).in("event_type", ["completed", "step_completed"])
      .order("occurred_at").order("id").range(from, to))
  ]);
  return [
    ...notes.map(row => ({ id: row.id, case_id: row.case_id, pic: row.created_by_profile_id, at: row.created_at, kind: "follow-up" as const, text: row.entry })),
    ...tasks.map(row => ({ id: row.id, case_id: row.case_id, pic: row.actor_profile_id, at: row.occurred_at,
      kind: (row.event_type === "completed" ? "task" : "step") as "task" | "step", text: row.step_title || row.title,
      timelineOnly: row.event_type === "completed" }))
  ];
}

async function draft(actor: CurrentActor, period: string) {
  const { start, end } = monthBounds(period)!;
  const [cases, staff, activity, completed] = await Promise.all([
    readAllPages((from, to) => actor.admin.from("tax_cases").select(caseFields, { count: "exact" })
      .lt("created_at", end).order("created_at").order("id").range(from, to)),
    directory(actor), caseEvents(actor, start, end),
    readAllPages((from, to) => actor.admin.from("my_work_task_completion_events")
      .select("id,actor_profile_id,occurred_at", { count: "exact" }).eq("event_type", "completed")
      .gte("occurred_at", start).lt("occurred_at", end).order("occurred_at").order("id").range(from, to))
  ]);
  const ledger: ReportEvent[] = completed.map(row => ({ id: row.id, pic: row.actor_profile_id, at: row.occurred_at, kind: "task" }));
  return buildMonthlyLeadershipReport(period, cases, staff, [...activity, ...ledger]);
}

async function existing(actor: CurrentActor, period: string) {
  const stored = await actor.admin.from("monthly_leadership_reports").select(snapshotFields).eq("period", period).maybeSingle();
  if (stored.error) throw new Error(stored.error.message);
  return stored.data;
}

export async function GET(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return json({ error: actor.error }, actor.status);
  try {
    if (!await allowed(actor)) return json({ error: "Only authorized leadership can view monthly reports." }, 403);
    const search = new URL(request.url).searchParams;
    if (search.get("watch") === "1") {
      const now = new Date();
      const [cases, staff, activity] = await Promise.all([
        readAllPages((from, to) => actor.admin.from("tax_cases").select(caseFields, { count: "exact" })
          .is("deleted_at", null).is("closed_at", null).not("stage", "eq", "Closed").order("id").range(from, to)),
        directory(actor), caseEvents(actor, new Date(now.getTime() - 30 * 86400000).toISOString(), now.toISOString())
      ]);
      return json({ watch: followUpWatch(now, cases, staff, activity) });
    }
    const period = search.get("period") || reportMonth();
    if (!monthBounds(period) || period > reportMonth()) return json({ error: "Choose a current or past report month." }, 400);
    const saved = await existing(actor, period);
    return json({ report: saved?.snapshot || await draft(actor, period), finalizedAt: saved?.finalized_at || null,
      finalizedBy: saved?.finalized_by_name || null, canFinalize: !saved && period < reportMonth() });
  } catch {
    return json({ error: "Monthly report data is unavailable. Check the database setup or try again." }, 503);
  }
}

export async function POST(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return json({ error: actor.error }, actor.status);
  try {
    if (!await allowed(actor)) return json({ error: "Only authorized leadership can finalize reports." }, 403);
    const body = await request.json().catch(() => null);
    const period = body?.period;
    if (typeof period !== "string" || !monthBounds(period) || period >= reportMonth()) return json({ error: "Only a closed month can be finalized." }, 400);
    let saved = await existing(actor, period);
    if (!saved) {
      const snapshot = await draft(actor, period);
      const result = await actor.admin.from("monthly_leadership_reports").insert({
        period, snapshot, finalized_by: actor.profile.id, finalized_by_name: actor.profile.display_name || actor.profile.full_name
      }).select(snapshotFields).single();
      saved = result.error?.code === "23505" ? await existing(actor, period) : result.data;
    }
    if (!saved) throw new Error("No snapshot was saved.");
    return json({ report: saved.snapshot, finalizedAt: saved.finalized_at, finalizedBy: saved.finalized_by_name, canFinalize: false });
  } catch {
    return json({ error: "The report could not be finalized. Try again." }, 503);
  }
}
