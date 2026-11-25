import { NextResponse } from "next/server";
import { currentActor } from "@/lib/access";
import { readClients, readCases, readOperations, readStaff } from "@/lib/workspace-reads";
import { readMyWork } from "@/lib/my-work-read";
import { readAnnualSheet } from "@/lib/annual-sheet-read";
import { allowedView, canEditSharedAllocation, canUseFeature, hasDelegatedOversight, readFeatureSettings } from "@/lib/feature-access";

export const dynamic = "force-dynamic";

const views = new Set(["matrix-view", "cases-view", "my-work-view", "client-view", "client-management-view", "allocation-view", "profile-view", "dashboard-view", "announcement-view"]);

export async function GET(request: Request) {
  const started = Date.now();
  const timings: Record<string, number> = {};
  const headers = () => ({
    "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", Pragma: "no-cache",
    "Server-Timing": Object.entries({ ...timings, total: Date.now() - started }).map(([key, duration]) => `${key};dur=${duration}`).join(",")
  });
  try {
    const actor = await currentActor(request);
    timings.auth = Date.now() - started;
    if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status, headers: headers() });
    const params = new URL(request.url).searchParams;
    const requestedView = params.get("view") || "matrix-view";
    const featureAccess = await readFeatureSettings(actor.admin);
    const allowed = (feature: Parameters<typeof canUseFeature>[2]) => canUseFeature(actor.profile.role, featureAccess.policy, feature);
    const oversight = requestedView === "allocation-view" ? "allocation" : requestedView === "client-management-view" ? "clients" : null;
    const delegated = oversight && (hasDelegatedOversight(actor.profile, featureAccess.policy, oversight) ||
      (oversight === "allocation" && actor.profile.role === "staff" && canEditSharedAllocation(actor.profile, featureAccess.policy)));
    const view = delegated ? requestedView
      : allowedView(actor.profile.role, featureAccess.policy, views.has(requestedView) ? requestedView : "matrix-view");
    const annualTeam = params.get("team") === "tax" ? "tax" : "accounting";
    const annual = view === "matrix-view" && params.get("mode") === "annual";
    const packets: Record<string, unknown> = {};
    async function collect(key: string, name: string, read: () => Promise<unknown>) {
      const start = Date.now();
      try { packets[key] = await read(); }
      finally { timings[name] = Date.now() - start; }
    }
    // One verified actor, independent reads in parallel, no process-wide user cache.
    const broad = !annual && !["my-work-view", "announcement-view"].includes(view) &&
      !delegated;
    const readPlan = { version: 1, clients: broad, staff: broad };
    const loads: Promise<void>[] = [];
    if (broad) loads.push(collect("/api/staff", "staff", () => readStaff(actor)), collect("/api/clients", "clients", () => readClients(actor)));
    if (view === "matrix-view" && !annual) {
      loads.push(collect("/api/operations?scope=monthly_compliance", "monthly", () => readOperations(actor, "monthly_compliance")));
    }
    if (allowed("operations") && ["client-view", "dashboard-view"].includes(view)) loads.push(collect("/api/operations", "operations", () => readOperations(actor, null)));
    if (allowed("cases") && ["cases-view", "my-work-view", "client-view", "dashboard-view"].includes(view)) loads.push(collect("/api/cases", "cases", () => readCases(actor)));
    if (allowed("myWork") && ["my-work-view", "client-view"].includes(view)) loads.push(collect(view === "my-work-view" ? "/api/my-work?period=current" : "/api/my-work", "tasks", () => readMyWork(actor.admin, actor.profile, view === "my-work-view" ? "current" : "all")));
    if (annual) loads.push(collect(`annual:${annualTeam}`, "annual", () => readAnnualSheet(actor, annualTeam, "auto")));
    await Promise.all(loads);
    return NextResponse.json({ user: { id: actor.userId }, profile: actor.profile, featureAccess, view, readPlan, packets, timings }, { headers: headers() });
  } catch (error) {
    console.error("[workspace bootstrap] failed", error);
    return NextResponse.json({ error: "Workspace data could not be loaded. Please retry." }, { status: 503, headers: headers() });
  }
}
