import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const html = read("public/demo.html");
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

function open(options: { view?: string; annual?: string; mobile?: boolean; status?: number; saveData?: boolean } = {}) {
  const warnings: string[] = [], requests: string[] = [], idle: Array<() => void> = [];
  const vc = new VirtualConsole();
  for (const kind of ["warn", "error"] as const) vc.on(kind, (...items: any[]) => warnings.push(items.join(" ")));
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://test.local/demo.html", virtualConsole: vc });
  const w = dom.window as any;
  const ui = { currentView: options.view || "cases-view", operationsMode: options.annual ? "annual" : "monthly", annualTeam: options.annual || "accounting", casesTab: "himbauan" };
  const cache = new Map<string, string>([["tax-practice-v2:user-a", JSON.stringify({ ui })], ["tax-dashboard-startup-view-v1", JSON.stringify(ui)]]);
  Object.defineProperty(w, "localStorage", { value: { getItem: (key: string) => cache.get(key) ?? null, setItem: (key: string, value: string) => cache.set(key, value), removeItem: (key: string) => cache.delete(key) } });
  Object.defineProperty(w.document, "visibilityState", { value: "visible", configurable: true });
  Object.defineProperty(w.navigator, "connection", { value: { saveData: !!options.saveData, effectiveType: "4g" } });
  w.matchMedia = () => ({ matches: !!options.mobile, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestIdleCallback = (callback: () => void) => { idle.push(callback); return idle.length; };
  w.cancelIdleCallback = () => {}; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.Headers = Headers; w.Response = Response; w.structuredClone = structuredClone;
  const staff = [{ id: "a", display_name: "PIC A", full_name: "PIC A", team_division: "Tax Team", role: "supervisor", directory_active: true }];
  const packets: Record<string, any> = {
    "/api/clients": { data: [{ id: "client-a", client_code: "CL-00001", legal_name: "Confirmed database client", status: "Active", company_form: "PT" }] },
    "/api/cases": { data: [] }, "/api/my-work": { tasks: [] }, "/api/staff": { staff },
    "/api/operations?scope=monthly_compliance": { data: [] }, "/api/operations": { data: [] }
  };
  if (options.annual) packets[`annual:${options.annual}`] = { team: options.annual, userId: "user-a", version: 1, actor: { id: "a" }, staff: [], rows: [], columns: [] };
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  w.fetch = async (url: string, init: any = {}) => {
    requests.push(url); assert.equal(init.method || "GET", "GET", "startup cannot write records");
    if (url.startsWith("/api/workspace/bootstrap")) {
      await hold;
      return new Response(JSON.stringify(options.status ? { error: "Unavailable" } : { user: { id: "user-a" }, profile: staff[0], packets, timings: { auth: 50, clients: 80 } }), { status: options.status || 200 });
    }
    return new Response(JSON.stringify(packets[url] || { data: [], tasks: [], announcements: [], staff }), { status: 200 });
  };
  w.eval(read("public/workspace-startup.js"));
  w.eval(read("public/vendor/purify.min.js")); w.eval(read("public/workspace-sync.js")); w.eval(read("public/annual-sheet-dashboard.js"));
  const opening = w.eval(html.match(/<script>([\s\S]*?)<\/script>/)![1]);
  return { dom, w, opening, release, requests, idle, cache, warnings };
}

test("confirmed bootstrap supplies the first screen with one request and never exposes sample rows while waiting", async () => {
  for (const view of ["cases-view", "my-work-view", "client-management-view", "allocation-view", "profile-view", "dashboard-view", "matrix-view"]) {
    const d = open({ view });
    try {
      assert.equal(d.requests.length, 1); assert.match(d.requests[0], /workspace\/bootstrap/);
      assert.equal(d.w.document.getElementById("app-loading-overlay").classList.contains("visible"), true);
      assert.equal(d.w.document.querySelectorAll("[data-case-sheet-row]").length, 0);
      d.release(); await d.opening; await tick();
      assert.deepEqual(d.warnings, [], view);
      assert.equal(d.requests.length, 1, `${view}: first screen should consume bootstrap, not refetch the same records`);
      assert.equal(d.w.document.getElementById("app-loading-overlay").classList.contains("visible"), false);
      assert.ok(d.w.__workspaceStartupTiming.readyMs >= 0);
      assert.equal(d.w.__workspaceStartupTiming.server.auth, 50);
      const hint = JSON.parse(d.cache.get("tax-dashboard-startup-view-v1")!);
      assert.deepEqual(Object.keys(hint).sort(), ["annualTeam", "currentView", "operationsMode"]);
    } finally { d.dom.window.close(); }
  }
});

test("failed startup keeps the loader and offers retry without demo data or follow-up reads", async () => {
  for (const status of [401, 403, 503]) {
    const d = open({ status });
    try {
      d.release(); await d.opening;
      assert.equal(d.requests.length, 1);
      assert.equal(d.w.document.getElementById("app-loading-overlay").classList.contains("visible"), true);
      assert.equal(d.w.document.querySelector("#app-loading-overlay button").textContent, "Retry");
      assert.equal(!!d.w.document.querySelector('#app-loading-overlay a[href="/login"]'), status !== 503);
      assert.equal(d.w.document.querySelectorAll("[data-case-sheet-row]").length, 0);
    } finally { d.dom.window.close(); }
  }
});

test("annual startup hands its account-bound snapshot to the registered frame and waits until the sheet is ready", async () => {
  for (const team of ["accounting", "tax"]) {
    const d = open({ view: "matrix-view", annual: team });
    try {
      d.release(); await tick(); await tick();
      const frame = d.w.document.querySelector("iframe.annual-sheet-frame");
      assert.ok(frame);
      assert.equal(d.w.document.getElementById("app-loading-overlay").classList.contains("visible"), true);
      const data = await d.w.AnnualDashboardSheets.takePreload(team, "user-a", frame.contentWindow);
      assert.equal(data.userId, "user-a");
      assert.equal(await d.w.AnnualDashboardSheets.takePreload(team, "user-a", frame.contentWindow), null);
      d.w.dispatchEvent(new d.w.MessageEvent("message", { origin: d.w.location.origin, source: frame.contentWindow, data: { type: "annual-sheet:state", team } }));
      await d.opening;
      assert.equal(d.requests.length, 1);
      assert.equal(d.w.document.getElementById("app-loading-overlay").classList.contains("visible"), false);
      assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("background reads start only after readiness and use at most two slots, or one on mobile", async () => {
  for (const mobile of [false, true]) {
    const d = open({ mobile });
    try {
      d.release(); await d.opening;
      const jobs = Array.from({ length: 5 }, () => () => new Promise<void>(resolve => { active++; peak = Math.max(peak, active); releases.push(() => { active--; resolve(); }); }));
      let active = 0, peak = 0; const releases: Array<() => void> = [];
      d.w.WorkspaceStartup.backgroundQueue(jobs);
      assert.equal(active, 0);
      // This test runs only the isolated queue's scheduled callback.
      const pump = d.idle.pop()!; pump(); await tick();
      assert.equal(peak, mobile ? 1 : 2);
      d.w.dispatchEvent(new d.w.Event("pagehide"));
      while (releases.length) releases.shift()!();
      await tick();
    } finally { d.dom.window.close(); }
  }
});

test("startup snapshots reject other users, expire, and constrained connections defer optional preloads", async () => {
  const d = open({ saveData: true });
  try {
    d.release(); await d.opening;
    assert.equal(d.w.WorkspaceStartup.take("/api/clients", "different-user"), null);
    let ran = false;
    d.w.WorkspaceStartup.backgroundQueue([() => { ran = true; }]);
    assert.equal(ran, false);
    d.w.document.querySelector('[data-view="my-work-view"]').click(); await tick();
    assert.ok(d.requests.includes("/api/my-work"), "foreground navigation still works without preloads");
  } finally { d.dom.window.close(); }
});

test("mobile startup normalizes an unsupported saved desktop menu before the request", async () => {
  const d = open({ mobile: true, view: "matrix-view" });
  try {
    assert.match(d.requests[0], /view=my-work-view/);
    d.release(); await d.opening;
    assert.equal(d.requests.length, 1);
    assert.equal(d.w.document.getElementById("app-loading-overlay").classList.contains("visible"), false);
  } finally { d.dom.window.close(); }
});

test("unconsumed startup packets are user-bound, single-use, and expire without persistent record storage", async () => {
  for (const mode of ["consume", "wrong-user", "expired"]) {
    const dom = new JSDOM("", { runScripts: "outside-only", url: "https://test.local/demo.html" });
    const w = dom.window as any;
    let now = 1000; w.Date.now = () => now;
    w.setTimeout = () => 0; w.clearTimeout = () => {}; w.matchMedia = () => ({ matches: false });
    w.fetch = async () => new Response(JSON.stringify({ user: { id: "u" }, profile: { id: "p" }, packets: { "/one": { data: ["confirmed"] } } }));
    try {
      w.eval(read("public/workspace-startup.js")); await w.WorkspaceStartup.begin();
      if (mode === "expired") now += 30001;
      const value = w.WorkspaceStartup.take("/one", mode === "wrong-user" ? "other" : "u");
      assert.equal(value?.data[0] || null, mode === "consume" ? "confirmed" : null);
      assert.equal(w.WorkspaceStartup.take("/one", "u"), null);
      assert.equal(w.localStorage.length, 0);
    } finally { dom.window.close(); }
  }
});
