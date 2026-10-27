import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const html = read("public/demo.html");
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

async function openDashboard(view = "matrix-view", mode = "monthly", savedUi: Record<string, any> = {}, emptyClients = false) {
  const warnings: string[] = [], requests: string[] = [];
  const virtualConsole = new VirtualConsole();
  for (const type of ["warn", "error"] as const) virtualConsole.on(type, (...items: any[]) => warnings.push(items.map(item => item?.stack || String(item)).join(" ")));
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/demo.html", virtualConsole });
  const w = dom.window as any, cache = new Map<string, string>();
  cache.set("tax-practice-v2:auth-user-1", JSON.stringify({ ui: { currentView: view, operationsMode: mode, ...savedUi } }));
  Object.defineProperty(w, "localStorage", { value: { getItem: (key: string) => cache.get(key) ?? null, setItem: (key: string, value: string) => cache.set(key, value), removeItem: (key: string) => cache.delete(key) } });
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.history.replaceState = () => {}; w.history.pushState = () => {};
  w.Headers = Headers; w.Response = Response; w.structuredClone = structuredClone;
  w.fetch = async (url: string, init: any = {}) => {
    requests.push(url);
    assert.equal(init.method || "GET", "GET", "startup must not write business records");
    const body = url === "/api/profile" ? { user: { id: "auth-user-1" }, profile: { id: "staff-1", display_name: "Supervisor", role: "supervisor", team_division: "Accounting Team", directory_active: true } }
      : url === "/api/clients" ? { data: emptyClients ? [] : [{ id: "client-1", client_code: "CL-00001", legal_name: "Confirmed database client", company_form: "PT", status: "Active" }] }
      : { data: [], tasks: [], staff: [], announcements: [] };
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
  w.eval(read("public/vendor/purify.min.js")); w.eval(read("public/workspace-sync.js")); w.eval(read("public/annual-sheet-dashboard.js"));
  await w.eval(html.match(/<script>([\s\S]*?)<\/script>/)![1]); await tick(); await tick();
  return { dom, w, requests, warnings, cache };
}

test("authenticated dashboard startup opens from each primary menu using confirmed API data", async () => {
  for (const [view, mode] of [["matrix-view", "monthly"], ["matrix-view", "annual"], ["cases-view", "annual"], ["my-work-view", "annual"], ["client-management-view", "annual"]]) {
    const d = await openDashboard(view, mode);
    try {
      assert.deepEqual(d.warnings, [], `${view}/${mode}: ${d.warnings.join("\n")}`);
      assert.equal(d.w.document.getElementById("app-loading-overlay")?.classList.contains("visible"), false, `${view}/${mode}: ${d.w.document.getElementById("app-loading-message")?.textContent}`);
      assert.ok(d.requests.includes("/api/profile")); assert.ok(d.requests.includes("/api/clients"));
    } finally { d.dom.window.close(); }
  }
});

test("a saved Himbauan tab loads successfully instead of being misreported as a database failure", async () => {
  const d = await openDashboard("cases-view", "annual", { casesTab: "himbauan" });
  try {
    assert.deepEqual(d.warnings, [], d.warnings.join("\n"));
    assert.equal(d.w.document.getElementById("app-loading-overlay").classList.contains("visible"), false);
    assert.equal(d.w.document.getElementById("workspace-breadcrumb").textContent, "Cases / Himbauan");
    d.w.document.querySelector('[data-cases-tab="pemeriksaan"]').click();
    assert.equal(d.w.document.getElementById("workspace-breadcrumb").textContent, "Cases / Pemeriksaan");
    d.w.document.querySelector('[data-cases-tab="himbauan"]').click();
    assert.equal(d.w.document.getElementById("workspace-breadcrumb").textContent, "Cases / Himbauan");
  } finally { d.dom.window.close(); }
});

test("obsolete saved navigation recovers without clearing appearance, allocation drafts or operational records", async () => {
  const scenarios = [
    ["cases-view", { casesTab: "old-case-tab" }, "Cases / Himbauan"],
    ["cases-view", { casesTab: "active" }, "Cases / Himbauan"],
    ["matrix-view", { operationsMode: "removed", operationsTab: "removed" }, "Operations / Monthly Compliance / Active Queue"],
    ["matrix-view", { operationsMode: "annual", annualTeam: "removed" }, "Operations / Annual Compliance / Accounting Team"],
    ["client-management-view", { clientManagementTab: "removed" }, "Clients / Active Clients"],
    ["dashboard-view", { managementTab: "removed" }, "Management / KPI Overview"],
    ["removed-view", {}, "Operations / Monthly Compliance / Active Queue"]
  ] as const;
  for (const [view, saved, expected] of scenarios) {
    const appearance = { theme: "dark", accent: "#be185d", myWorkBackground: "data:image/png;base64,AAAA" }, allocationDrafts = { "client-1": { nextTaxPic: "Draft PIC" } };
    const d = await openDashboard(view, "monthly", { ...saved, appearance, allocationDrafts });
    try {
      assert.deepEqual(d.warnings, [], d.warnings.join("\n"));
      assert.equal(d.w.document.getElementById("app-loading-overlay").classList.contains("visible"), false);
      assert.equal(d.w.document.getElementById("workspace-breadcrumb").textContent, expected);
      const stored = JSON.parse(d.cache.get("tax-practice-v2:auth-user-1")!);
      assert.deepEqual(stored.ui.appearance, appearance); assert.deepEqual(stored.ui.allocationDrafts, allocationDrafts);
    } finally { d.dom.window.close(); }
  }
});

test("an empty authorized client list still opens a saved Client Detail view safely", async () => {
  const d = await openDashboard("client-view", "monthly", {}, true);
  try {
    assert.deepEqual(d.warnings, [], d.warnings.join("\n"));
    assert.equal(d.w.document.getElementById("app-loading-overlay").classList.contains("visible"), false);
    assert.match(d.w.document.getElementById("client-view").textContent, /Client unavailable/);
  } finally { d.dom.window.close(); }
});

test("browser Back/Forward snapshots normalize retired submenu values without changing authenticated identity", async () => {
  const d = await openDashboard("cases-view", "monthly", { casesTab: "himbauan" });
  try {
    for (const snapshot of [
      { currentView: "cases-view", casesTab: "retired-case-tab" },
      { currentView: "matrix-view", operationsMode: "monthly", operationsTab: "retired-monthly-tab" },
      { currentView: "cases-view", casesTab: "pemeriksaan" }
    ]) {
      d.w.dispatchEvent(new d.w.PopStateEvent("popstate", { state: snapshot })); await tick();
      assert.deepEqual(d.warnings, [], d.warnings.join("\n"));
      assert.equal(d.w.document.getElementById("sidebar-user-name").textContent, "Supervisor");
      assert.equal(d.w.document.getElementById("app-loading-overlay").classList.contains("visible"), false);
    }
    assert.equal(d.w.document.getElementById("workspace-breadcrumb").textContent, "Cases / Pemeriksaan");
  } finally { d.dom.window.close(); }
});
