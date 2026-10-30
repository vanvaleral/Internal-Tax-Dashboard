import { NextResponse } from "next/server";
import { currentActor } from "@/lib/access";
import { readClients, readCases, readOperations, readStaff } from "@/lib/workspace-reads";
import { readMyWork } from "@/lib/my-work-read";
import { annualContext, annualResponseData } from "@/lib/annual-sheet-read";

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
    const view = views.has(requestedView) ? requestedView : "matrix-view";
    const annualTeam = params.get("team") === "tax" ? "tax" : "accounting";
    const annual = view === "matrix-view" && params.get("mode") === "annual";
    const packets: Record<string, unknown> = {};
    async function collect(key: string, name: string, read: () => Promise<unknown>) {
      const start = Date.now();
      try { packets[key] = await read(); }
      finally { timings[name] = Date.now() - start; }
    }
    // One verified actor, independent reads in parallel, no process-wide user cache.
    const loads = [collect("/api/staff", "staff", () => readStaff(actor)), collect("/api/clients", "clients", async () => {
      const result = await readClients(actor);
      while (result.data.length < (result.count || 0)) {
        const page = await readClients(actor, new URLSearchParams({ offset: String(result.data.length) }));
        if (!page.data.length) throw new Error("Client list changed while loading. Please retry.");
        result.data.push(...page.data);
      }
      return result;
    })];
    if (view === "matrix-view" && !annual) {
      loads.push(collect("/api/operations?scope=monthly_compliance", "monthly", () => readOperations(actor, "monthly_compliance")));
    }
    if (["client-view", "dashboard-view"].includes(view)) loads.push(collect("/api/operations", "operations", () => readOperations(actor, null)));
    if (["cases-view", "my-work-view", "client-view", "dashboard-view"].includes(view)) loads.push(collect("/api/cases", "cases", () => readCases(actor)));
    if (["my-work-view", "client-view"].includes(view)) loads.push(collect("/api/my-work", "tasks", () => readMyWork(actor.admin, actor.profile)));
    if (annual) loads.push(collect(`annual:${annualTeam}`, "annual", async () => annualResponseData(actor, annualTeam, await annualContext(actor, annualTeam))));
    await Promise.all(loads);
    return NextResponse.json({ user: { id: actor.userId }, profile: actor.profile, view, packets, timings }, { headers: headers() });
  } catch (error) {
    console.error("[workspace bootstrap] failed", error);
    return NextResponse.json({ error: "Workspace data could not be loaded. Please retry." }, { status: 503, headers: headers() });
  }
}
