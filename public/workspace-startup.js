/* Startup snapshots live only in this document and never authorize a save. */
(() => {
  "use strict";
  const views = new Set(["matrix-view", "cases-view", "my-work-view", "client-view", "client-management-view", "allocation-view", "profile-view", "dashboard-view", "announcement-view"]);
  const hintKey = "tax-dashboard-startup-view-v1";
  let pending, owner = "", receivedAt = 0;
  const packets = new Map();
  const metrics = { requestMs: 0, server: {}, readyMs: 0 };
  function normalize(value = {}) {
    value = value && typeof value === "object" ? value : {};
    let view = views.has(value.currentView) ? value.currentView : "matrix-view";
    if (new URLSearchParams(location.search).get("casesFullscreen") === "1") view = "cases-view";
    if (window.matchMedia?.("(max-width: 900px)").matches && !["my-work-view", "cases-view", "client-management-view", "client-view", "announcement-view", "profile-view"].includes(view)) view = "my-work-view";
    return { currentView: view, operationsMode: value.operationsMode === "annual" ? "annual" : "monthly", annualTeam: value.annualTeam === "tax" ? "tax" : "accounting" };
  }
  function begin() {
    if (location.protocol === "file:") return null;
    if (pending) return pending;
    let hint = {};
    try { hint = JSON.parse(localStorage.getItem(hintKey) || "{}"); } catch {}
    const plan = normalize(hint);
    const params = new URLSearchParams({ view: plan.currentView, mode: plan.operationsMode, team: plan.annualTeam });
    const started = performance.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    pending = fetch(`/api/workspace/bootstrap?${params}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } }).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.user?.id || !data.profile?.id || !data.packets || typeof data.packets !== "object") {
        const error = new Error(data.error || "Workspace data could not be loaded. Please retry."); error.status = response.status; throw error;
      }
      owner = data.user.id; receivedAt = Date.now();
      for (const [key, value] of Object.entries(data.packets)) packets.set(key, value);
      metrics.requestMs = Math.round(performance.now() - started); metrics.server = data.timings || {};
      return { user: data.user, profile: data.profile };
    }).finally(() => window.clearTimeout(timeout));
    pending.catch(() => {});
    return pending;
  }
  function take(key, userId) {
    if (userId !== owner || Date.now() - receivedAt >= 30000) { packets.clear(); return null; }
    if (!packets.has(key)) return null;
    const result = packets.get(key); packets.delete(key); return result;
  }
  function ready() {
    packets.clear();
    metrics.readyMs = Math.round(performance.now());
    window.__workspaceStartupTiming = structuredClone(metrics);
    performance.mark?.("workspace:ready");
    if (parent !== window) parent.postMessage({ type: "dashboard:ready", timing: metrics }, location.origin);
  }
  function remember(value) {
    if (location.protocol === "file:" || new URLSearchParams(location.search).get("casesFullscreen") === "1") return;
    try { localStorage.setItem(hintKey, JSON.stringify(normalize(value))); } catch {}
  }
  function backgroundQueue(jobs, onComplete = () => {}) {
    const connection = navigator.connection;
    // On constrained connections, fetch only what the user actually opens.
    if (connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType)) return;
    const limit = window.matchMedia?.("(max-width: 900px)").matches || navigator.deviceMemory <= 2 ? 1 : 2;
    const waiting = [...jobs]; let active = 0, scheduled = false, stopped = false;
    const schedule = () => {
      if (stopped || scheduled || document.visibilityState === "hidden") return;
      scheduled = true;
      const run = () => { scheduled = false; pump(); };
      if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 2000 });
      else window.setTimeout(run, 250);
    };
    const finish = () => { if (stopped) return; stopped = true; document.removeEventListener("visibilitychange", schedule); onComplete(); };
    function pump() {
      if (stopped || document.visibilityState === "hidden") return;
      while (active < limit && waiting.length) {
        const job = waiting.shift(); active++;
        Promise.resolve().then(job).catch(() => {}).finally(() => { active--; if (!waiting.length && !active) finish(); else schedule(); });
      }
      if (!waiting.length && !active) finish();
    }
    document.addEventListener("visibilitychange", schedule);
    window.addEventListener("pagehide", () => { stopped = true; waiting.length = 0; document.removeEventListener("visibilitychange", schedule); }, { once: true });
    schedule();
  }
  window.WorkspaceStartup = { begin, take, ready, remember, backgroundQueue };
  begin();
})();
