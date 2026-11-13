import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
import { defaultFeaturePolicy } from "../lib/feature-access.ts";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const html = read("public/demo.html");
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

async function openDashboard(view = "matrix-view", mode = "monthly", savedUi: Record<string, any> = {}, emptyClients = false, role = "supervisor") {
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
  const policy = defaultFeaturePolicy();
  policy.associate.management.mode = "enabled"; policy.leader.management.mode = "enabled";
  let featureAccess = { policy, version: 1, ready: true };
  const featureWrites: any[] = [];
  w.fetch = async (url: string, init: any = {}) => {
    requests.push(url);
    if (url === "/api/feature-access" && init.method === "PUT") {
      const body = JSON.parse(init.body); featureWrites.push(body);
      featureAccess = { policy: body.policy, version: featureAccess.version + 1, ready: true };
      return { ok: true, status: 200, json: async () => structuredClone(featureAccess) };
    }
    assert.equal(init.method || "GET", "GET", "startup must not write business records");
    const body = url === "/api/profile" ? { user: { id: "auth-user-1" }, featureAccess, profile: { id: "staff-1", display_name: "Supervisor", role, team_division: "Accounting Team", directory_active: true } }
      : url === "/api/clients" ? { data: emptyClients ? [] : [{ id: "client-1", client_code: "CL-00001", legal_name: "Confirmed database client", company_form: "PT", status: "Active" }] }
      : { data: [], tasks: [], staff: [], announcements: [] };
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
  w.eval(read("public/vendor/purify.min.js")); w.eval(read("public/workspace-sync.js")); w.eval(read("public/feature-access.js")); w.eval(read("public/annual-sheet-dashboard.js"));
  await w.eval(html.match(/<script>([\s\S]*?)<\/script>/)![1]); await tick(); await tick();
  return { dom, w, requests, warnings, cache, featureWrites };
}

test("PIC Features is a separate saved Management tab and PIC Access remains focused on accounts", async () => {
  const d = await openDashboard("dashboard-view", "monthly", { managementTab: "workload" });
  try {
    const doc = d.w.document;
    assert.ok(doc.querySelector('[data-management-tab="features"]'));
    assert.equal(doc.querySelector(".feature-access-editor"), null);
    assert.ok(doc.querySelector("[data-create-staff]"));
    doc.querySelector('[data-management-tab="features"]').click();
    assert.ok(doc.querySelector(".feature-access-editor"));
    assert.equal(doc.querySelector("[data-create-staff]"), null);
    assert.equal(doc.getElementById("workspace-breadcrumb").textContent, "Management / PIC Features");
    assert.equal(JSON.parse(d.cache.get("tax-practice-v2:auth-user-1")!).ui.managementTab, "features");
    assert.equal(d.featureWrites.length, 0); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
  const reopened = await openDashboard("dashboard-view", "monthly", { managementTab: "features" });
  try {
    assert.ok(reopened.w.document.querySelector(".feature-access-editor"));
    assert.equal(reopened.w.document.getElementById("workspace-breadcrumb").textContent, "Management / PIC Features");
    assert.deepEqual(reopened.warnings, []);
  } finally { reopened.dom.window.close(); }
});

test("PIC Features retains unsaved rule/message edits across tabs and saves through the existing versioned endpoint", async () => {
  const d = await openDashboard("dashboard-view", "monthly", { managementTab: "features" });
  try {
    const doc = d.w.document;
    const input = doc.querySelector('[data-feature-mode="cases"][data-feature-tier="associate"]');
    input.value = "preview"; input.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    const message = doc.querySelector('[data-feature-message="cases"][data-feature-tier="associate"]');
    message.value = "Please report any problems."; message.dispatchEvent(new d.w.Event("input", { bubbles: true }));
    doc.querySelector('[data-management-tab="workload"]').click(); await tick();
    assert.equal(doc.querySelector(".feature-access-editor"), null);
    doc.querySelector('[data-management-tab="features"]').click();
    assert.equal(doc.querySelector('[data-feature-mode="cases"][data-feature-tier="associate"]').value, "preview");
    assert.equal(doc.querySelector('[data-feature-message="cases"][data-feature-tier="associate"]').value, "Please report any problems.");
    assert.equal(d.featureWrites.length, 0);
    doc.querySelector("[data-feature-save]").click(); await tick(); await tick();
    assert.equal(d.featureWrites.length, 1); assert.equal(d.featureWrites[0].version, 1);
    assert.equal(d.featureWrites[0].policy.associate.cases.message, "Please report any problems.");
    assert.match(doc.querySelector("[data-feature-save-status]").textContent, /Saved settings \/ version 2/);
    assert.equal(doc.querySelector("[data-feature-save]").disabled, true);
    assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("Associates and Leaders with Management access cannot open PIC Features via saved or forged tab navigation", async () => {
  for (const role of ["staff", "leader"]) {
    const d = await openDashboard("dashboard-view", "monthly", { managementTab: "features" }, false, role);
    try {
      const doc = d.w.document;
      assert.equal(doc.querySelector('[data-management-tab="features"]'), null);
      assert.equal(doc.querySelector(".feature-access-editor"), null);
      assert.equal(doc.getElementById("workspace-breadcrumb").textContent, "Management / KPI Overview");
      const forged = doc.createElement("button"); forged.dataset.managementTab = "features"; doc.body.append(forged); forged.click();
      assert.equal(doc.querySelector(".feature-access-editor"), null);
      assert.equal(doc.getElementById("workspace-breadcrumb").textContent, "Management / KPI Overview");
      assert.equal(d.featureWrites.length, 0); assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

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

test("shared submenu presentation preserves primary and nested navigation without business writes", async () => {
  const d = await openDashboard("matrix-view", "monthly");
  try {
    assert.ok(d.w.document.querySelector('link[href="submenu-tabs.css"]'));
    assert.equal(d.w.document.querySelectorAll('.workspace-operations .ops-mode-tabs button').length, 2);
    assert.equal(d.w.document.querySelectorAll('.workspace-operations .submenu-secondary [data-operations-tab]').length, 4);
    d.w.document.querySelector('[data-operations-tab="history"]').click();
    assert.ok(d.w.document.querySelector('.submenu-secondary [data-operations-tab="history"].solid-btn'));
    d.w.document.querySelector('[data-operations-mode="annual"]').click();
    assert.equal(d.w.document.querySelectorAll('.annual-sheet-heading .submenu-secondary [data-annual-team]').length, 2);
    d.w.document.querySelector('[data-annual-team="tax"]').click();
    assert.ok(d.w.document.querySelector('.submenu-secondary [data-annual-team="tax"].solid-btn'));
    assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
  for (const [view, ui, selector, count] of [
    ["dashboard-view", { managementTab:"workload" }, '[aria-label="PIC access status"] button', 2],
    ["client-management-view", { clientManagementTab:"contracts" }, '[aria-label="Contract status"] button', 4],
    ["profile-view", {}, '.workspace-tabs [data-profile-tab]', 3],
    ["my-work-view", {}, '.my-work-tabs [data-my-work-tab]', 2]
  ] as const) {
    const page = await openDashboard(view, "monthly", ui);
    try {
      assert.equal(page.w.document.querySelectorAll(selector).length, count);
      assert.deepEqual(page.warnings, []);
    } finally { page.dom.window.close(); }
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
