import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const dashboard = readFileSync(new URL("../public/annual-sheet-dashboard.js", import.meta.url), "utf8");
const transport = readFileSync(new URL("../public/annual-sheet-live.js", import.meta.url), "utf8");
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const context = (team = "accounting", userId = "user-1") => ({ team, userId, version: 1, actor: { id: "staff-1", name: "PIC", role: "staff", team: team === "tax" ? "Tax Team" : "Accounting Team" }, staff: [], rows: [{ id: "row-1", year: 2025, clientName: "Authorized client" }], columns: [] });

async function openDashboard(options: { mobile?: boolean; saveData?: boolean; effectiveType?: string; memory?: number; hidden?: boolean; hold?: boolean; status?: number; userId?: string } = {}) {
  const dom = new JSDOM('<main class="main"><div id="matrix-view"></div></main>', { runScripts: "outside-only", url: "http://localhost/demo.html" });
  const w = dom.window as any, requests: any[] = [], idle = new Map<number, () => void>();
  let serial = 0, clock = 100000, hidden = !!options.hidden, release!: () => void;
  w.structuredClone = structuredClone;
  w.Date.now = () => clock;
  w.matchMedia = () => ({ matches: !!options.mobile });
  Object.defineProperty(w.document, "visibilityState", { get: () => hidden ? "hidden" : "visible" });
  Object.defineProperty(w.navigator, "connection", { value: { saveData: !!options.saveData, effectiveType: options.effectiveType || "4g" } });
  Object.defineProperty(w.navigator, "deviceMemory", { value: options.memory || 8 });
  w.requestIdleCallback = (callback: () => void) => { idle.set(++serial, callback); return serial; };
  w.cancelIdleCallback = (id: number) => idle.delete(id);
  w.fetch = async (url: string, init: any) => {
    requests.push({ url, init });
    if (options.hold) await new Promise<void>(resolve => { release = resolve; });
    const status = options.status || 200;
    return { ok: status < 400, status, json: async () => status < 400 ? context(url.includes("team=tax") ? "tax" : "accounting", options.userId || "user-1") : { error: "Not available" } };
  };
  w.eval(dashboard); await tick();
  const api = w.AnnualDashboardSheets;
  api.configure(() => {}, "user-1");
  const open = (team = "accounting") => {
    api.render(w.document.getElementById("matrix-view"), { currentView: "matrix-view", operationsMode: "annual", annualTeam: team });
    return w.document.querySelector(`iframe[title="Annual ${team === "tax" ? "Tax" : "Accounting"} control sheet"]`);
  };
  return { dom, w, api, requests, idle, open,
    runIdle() { const callbacks = [...idle.values()]; idle.clear(); callbacks.forEach(callback => callback()); },
    release() { release(); }, advance(ms = 31000) { clock += ms; },
    visibility(value: boolean) { hidden = value; w.document.dispatchEvent(new w.Event("visibilitychange")); }
  };
}

test("annual idle preload warms only the preferred team, never creates a hidden sheet and hands data off once", async () => {
  for (const team of ["accounting", "tax"]) {
    const d = await openDashboard();
    try {
      assert.equal(d.requests.length, 0);
      d.api.preload(team === "tax" ? "Tax Team" : "Accounting Team");
      assert.equal(d.requests.length, 0, "startup must not perform the speculative read synchronously");
      assert.equal(d.idle.size, 1); d.runIdle(); await tick();
      assert.equal(d.requests.length, 1); assert.equal(d.w.document.querySelectorAll("iframe").length, 0);
      assert.equal(d.w.document.querySelectorAll("script").length, 0, "prefetch must not execute sheet code");
      assert.match(d.requests[0].url, new RegExp(`team=${team}&part=sheet`));
      assert.equal(d.requests[0].init.headers["x-workspace-user"], "user-1");
      assert.equal(d.requests[0].init.cache, "no-store");
      assert.equal(d.requests[0].init.credentials, "same-origin");
      assert.equal(d.w.document.querySelectorAll('link[rel="prefetch"]').length, team === "tax" ? 6 : 5);
      assert.ok(d.w.document.querySelector('link[rel="prefetch"][data-annual-prefetch="submenu-tabs.css"]'));
      const frame = d.open(team);
      assert.equal(await d.api.takePreload(team, "different-user", frame.contentWindow), null);
      assert.equal(await d.api.takePreload(team, "user-1", d.w), null, "unregistered windows cannot consume the snapshot");
      const data = await d.api.takePreload(team, "user-1", frame.contentWindow);
      assert.equal(data.rows[0].clientName, "Authorized client");
      assert.equal(await d.api.takePreload(team, "user-1", frame.contentWindow), null, "one consumer only");
      d.api.preload(team === "tax" ? "Tax Team" : "Accounting Team"); d.runIdle(); await tick();
      assert.equal(d.requests.length, 1, "do not poll or rewarm an active sheet");
    } finally { d.dom.window.close(); }
  }
});

test("opening annual during preload shares the pending read and invalidation fences late results", async () => {
  for (const invalidate of [false, true]) {
    const d = await openDashboard({ hold: true });
    try {
      d.api.preload("Accounting Team"); d.runIdle();
      const frame = d.open(), pending = d.api.takePreload("accounting", "user-1", frame.contentWindow);
      if (invalidate) d.api.directoryChanged("new-access");
      d.release(); const data = await pending;
      assert.equal(d.requests.length, 1);
      if (invalidate) { assert.equal(data, null); assert.equal(d.requests[0].init.signal.aborted, true); }
      else assert.equal(data.rows.length, 1);
    } finally { d.dom.window.close(); }
  }
});

test("annual preloading skips small screens, constrained connections, low-memory devices, hidden pages and unknown teams", async () => {
  for (const options of [{ mobile: true }, { saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }, { memory: 2 }, { hidden: true }]) {
    const d = await openDashboard(options);
    try {
      d.api.preload("Accounting Team"); d.runIdle(); await tick();
      assert.equal(d.requests.length, 0); assert.equal(d.w.document.querySelectorAll('link[rel="prefetch"]').length, 0);
    } finally { d.dom.window.close(); }
  }
  const d = await openDashboard();
  try { d.api.preload("Unknown Team"); d.runIdle(); assert.equal(d.requests.length, 0); }
  finally { d.dom.window.close(); }
});

test("expired, hidden, account-changed and page-history annual snapshots cannot be reused", async () => {
  for (const action of ["expire", "hide", "account", "pagehide", "logout"]) {
    const d = await openDashboard();
    try {
      d.api.preload("Accounting Team"); d.runIdle(); await tick();
      const frame = d.open();
      if (action === "expire") d.advance();
      if (action === "hide") d.visibility(true);
      if (action === "account") d.api.configure(() => {}, "user-2");
      if (action === "pagehide") d.w.dispatchEvent(new d.w.Event("pagehide"));
      if (action === "logout") d.api.clear();
      assert.equal(await d.api.takePreload("accounting", "user-1", frame.contentWindow), null, action);
      if (["account", "logout"].includes(action)) assert.equal(d.w.document.querySelectorAll("iframe").length, 0);
    } finally { d.dom.window.close(); }
  }
});

test("failed or mismatched speculative reads never supply cached data or trigger automatic retry storms", async () => {
  for (const options of [{ status: 500 }, { status: 403 }, { userId: "wrong-user" }]) {
    const d = await openDashboard(options);
    try {
      d.api.preload("Accounting Team"); d.runIdle(); await tick();
      const frame = d.open();
      assert.equal(await d.api.takePreload("accounting", "user-1", frame.contentWindow), null);
      d.api.preload("Accounting Team"); d.runIdle(); await tick();
      assert.equal(d.requests.length, 1);
    } finally { d.dom.window.close(); }
  }
});

test("foreground navigation cancels scheduled preload, and selecting the other team discards unused work", async () => {
  const d = await openDashboard();
  try {
    d.api.preload("Tax Team"); assert.equal(d.idle.size, 1);
    d.open("accounting"); assert.equal(d.idle.size, 0); d.runIdle(); assert.equal(d.requests.length, 0);
  } finally { d.dom.window.close(); }
  const held = await openDashboard({ hold: true });
  try {
    held.api.preload("Tax Team"); held.runIdle(); held.open("accounting");
    assert.equal(held.requests[0].init.signal.aborted, true);
    held.release(); await tick();
    const frame = held.open("tax"); assert.equal(await held.api.takePreload("tax", "user-1", frame.contentWindow), null);
  } finally { held.dom.window.close(); }
});

test("embedded annual transport consumes one bound parent preload; refresh and full-screen use authenticated requests", async () => {
  for (const mode of ["embedded=1&account=user-1", "fullscreen=1&account=user-1", "embedded=1", "embedded=1&account=user-1&crossOrigin=1"]) {
    const dom = new JSDOM("", { runScripts: "outside-only", url: `http://localhost/annual-accounting-sheet-demo.html?live=1&${mode}` });
    const w = dom.window as any; let reads = 0, takes = 0;
    try {
      Object.defineProperty(w, "parent", { value: { location: { origin: mode.includes("crossOrigin") ? "http://evil.example" : "http://localhost" }, postMessage() {}, AnnualDashboardSheets: { async takePreload(team: string, user: string, source: any) { takes++; assert.equal(team, "accounting"); assert.equal(user, "user-1"); assert.equal(source, w); return context(); } } } });
      w.fetch = async (_url: string, init: any) => { reads++; assert.equal(init.cache, "no-store"); return { ok: true, json: async () => context() }; };
      w.eval(transport);
      const eligible = mode === "embedded=1&account=user-1";
      assert.equal((await w.AnnualSheetLive.load()).rows.length, 1);
      assert.equal(takes, eligible ? 1 : 0); assert.equal(reads, eligible ? 0 : 1);
      await w.AnnualSheetLive.load(); assert.equal(reads, eligible ? 1 : 2); assert.equal(takes, eligible ? 1 : 0);
    } finally { dom.window.close(); }
  }
});

test("a cancelled annual preload handoff cannot replace a newer confirmed transport context", async () => {
  const dom = new JSDOM("", { runScripts: "outside-only", url: "http://localhost/sheet?live=1&embedded=1&account=user-1" });
  const w = dom.window as any; let release!: (value: any) => void;
  try {
    Object.defineProperty(w, "parent", { value: { location: { origin: "http://localhost" }, postMessage() {}, AnnualDashboardSheets: { takePreload: () => new Promise(resolve => { release = resolve; }) } } });
    w.fetch = async () => ({ ok: true, json: async () => ({ ...context(), version: 2 }) });
    w.eval(transport);
    const previous = w.AnnualSheetLive.load(); w.AnnualSheetLive.cancelLoad();
    assert.equal((await w.AnnualSheetLive.load()).version, 2);
    release(context()); assert.equal(await previous, null); assert.equal(w.AnnualSheetLive.context.version, 2);
  } finally { dom.window.close(); }
});

test("dashboard schedules annual speculation after startup outside standalone Cases and clears it on successful logout", () => {
  const html = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");
  assert.match(html, /const backgroundComplete = \(\) => \{\s*if \(!IS_CASES_FULLSCREEN\) window\.AnnualDashboardSheets\?\.preload\(state\.teamDivision\);/);
  assert.match(html, /WorkspaceStartup\.backgroundQueue\(remainingLoads, backgroundComplete\)/);
  const logout = html.slice(html.indexOf("if (logoutTrigger) {"), html.indexOf("if (openAppearanceSettingsTrigger)"));
  assert.ok(logout.indexOf("if (!response.ok)") < logout.indexOf("AnnualDashboardSheets?.clear()"));
  assert.ok(logout.indexOf("AnnualDashboardSheets?.clear()") < logout.indexOf('location.assign("/login")'));
});
