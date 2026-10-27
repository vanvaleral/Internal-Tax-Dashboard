/* Account-bound annual sheets. Optional initial preloads use the same authenticated API. */
(() => {
  "use strict";
  if (location.protocol === "file:") return;
  const sheets = new Map();
  let onSaved = () => {}, expectedUserId = "";
  let appearance = { theme: "light", accent: "#087f8d" };
  function sendAppearance(sheet) { sheet.frame.contentWindow.postMessage({ type: "annual-sheet:appearance", appearance }, location.origin); }
  function setAppearance(value) {
    if (!["light", "dark"].includes(value?.theme) || !/^#[0-9a-f]{6}$/i.test(value?.accent || "")) return;
    appearance = { theme: value.theme, accent: value.accent.toLowerCase() };
    for (const sheet of sheets.values()) sendAppearance(sheet);
  }
  let preferredTeam = "", preloadAttempted = false, idleHandle = null, idleKind = "", warm = null, warmEpoch = 0, pageActive = true;
  const warmLifetime = 30000;
  function cancelIdle() {
    if (idleHandle === null) return;
    if (idleKind === "idle") window.cancelIdleCallback?.(idleHandle); else window.clearTimeout(idleHandle);
    idleHandle = null;
  }
  function discardPreload() {
    warmEpoch++;
    if (warm) { warm.controller.abort(); window.clearTimeout(warm.timeout); window.clearTimeout(warm.expiry); }
    warm = null;
  }
  function canPreload() {
    const connection = navigator.connection;
    return pageActive && !!expectedUserId && document.visibilityState === "visible"
      && !window.matchMedia?.("(max-width: 900px)").matches
      && !connection?.saveData && !["slow-2g", "2g"].includes(connection?.effectiveType)
      && !(navigator.deviceMemory && navigator.deviceMemory <= 2);
  }
  function prefetchFiles(team) {
    const files = [["annual-accounting-sheet-demo.css", "style"], ["annual-sheet-dashboard.css", "style"], ["annual-sheet-live.js", "script"], ["annual-accounting-sheet-demo.js", "script"]];
    if (team === "tax") files.push(["annual-tax-sheet-config.js", "script"]);
    for (const [href, as] of files) {
      if (document.querySelector(`link[data-annual-prefetch="${href}"]`)) continue;
      const link = document.createElement("link"); link.rel = "prefetch"; link.as = as; link.href = href; link.dataset.annualPrefetch = href; document.head.append(link);
    }
  }
  function startPreload(team) {
    const entry = { team, userId: expectedUserId, epoch: warmEpoch, controller: new AbortController(), checkedAt: 0, timeout: null, expiry: null, promise: null };
    warm = entry;
    entry.timeout = window.setTimeout(() => { if (warm === entry) discardPreload(); }, 8000);
    entry.promise = (async () => {
      const response = await fetch(`/api/annual-sheet?team=${team}&part=sheet`, {
        method: "GET", credentials: "same-origin", cache: "no-store", signal: entry.controller.signal,
        headers: { Accept: "application/json", "x-workspace-user": entry.userId }
      });
      const data = await response.json();
      if (warm !== entry || entry.epoch !== warmEpoch || entry.userId !== expectedUserId) return null;
      if (!response.ok || data.userId !== entry.userId) { const error = new Error(data.error || "Annual workspace access changed."); error.status = response.ok ? 409 : response.status; throw error; }
      if (data.team !== team || !data.actor?.id || !Array.isArray(data.rows) || !Array.isArray(data.staff) || !Array.isArray(data.columns)) throw new Error("Incomplete annual preload.");
      window.clearTimeout(entry.timeout); entry.checkedAt = Date.now();
      entry.expiry = window.setTimeout(() => { if (warm === entry) discardPreload(); }, warmLifetime);
      return data;
    })().catch(error => { if (warm === entry) discardPreload(); throw error; });
    // Speculative failures are silent; opening the sheet retains its normal retry path.
    entry.promise.catch(() => {});
  }
  function schedulePreload() {
    if (idleHandle !== null || preloadAttempted || !preferredTeam || sheets.size || !canPreload() || document.readyState !== "complete") return;
    const run = () => {
      idleHandle = null;
      if (preloadAttempted || sheets.size || !canPreload()) return;
      preloadAttempted = true; prefetchFiles(preferredTeam); startPreload(preferredTeam);
    };
    if (window.requestIdleCallback) { idleKind = "idle"; idleHandle = window.requestIdleCallback(run); }
    else { idleKind = "timer"; idleHandle = window.setTimeout(run, 1500); }
  }
  async function takePreload(team, userId, sourceWindow) {
    const entry = warm;
    if (!entry || !userId || userId !== expectedUserId || entry.userId !== userId || entry.team !== team || sheets.get(team)?.frame.contentWindow !== sourceWindow) return null;
    try {
      const data = await entry.promise;
      if (!data || warm !== entry || entry.epoch !== warmEpoch || userId !== expectedUserId || Date.now() - entry.checkedAt >= warmLifetime) { if (warm === entry) discardPreload(); return null; }
      // One handoff only. The iframe's authenticated transport owns subsequent reads and writes.
      warm = null; window.clearTimeout(entry.expiry); return structuredClone(data);
    } catch (error) { if ([401, 403, 409].includes(error.status)) throw error; return null; }
  }
  function clear() {
    cancelIdle(); discardPreload(); preferredTeam = ""; preloadAttempted = false; expectedUserId = "";
    for (const sheet of sheets.values()) sheet.section.remove();
    sheets.clear(); document.body.classList.remove("annual-sheets-enabled");
  }
  function ensure(team) {
    if (sheets.has(team)) return sheets.get(team);
    cancelIdle(); preloadAttempted = true;
    if (warm && warm.team !== team) discardPreload();
    document.body.classList.add("annual-sheets-enabled");
    if (!document.querySelector('link[data-annual-sheets-style]')) {
      const style = document.createElement("link"); style.rel = "stylesheet"; style.href = "annual-sheet-dashboard.css"; style.dataset.annualSheetsStyle = "yes"; document.head.append(style);
    }
    const section = document.createElement("section"); section.className = "annual-sheet-container"; section.hidden = true; section.style.position = "relative";
    const loading = document.createElement("div"); loading.className = "annual-sheet-loading"; loading.setAttribute("role", "status");
    loading.style.cssText = "position:absolute;inset:0;z-index:1;display:grid;place-content:center;justify-items:center;gap:14px;min-height:300px;background:rgba(240,242,238,.78);backdrop-filter:blur(10px);color:#35575d;font-size:13px";
    loading.innerHTML = '<span class="workspace-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>Loading annual workspace...</span>';
    const frame = document.createElement("iframe"); frame.title = `Annual ${team === "tax" ? "Tax" : "Accounting"} control sheet`; frame.className = "annual-sheet-frame";
    frame.src = `./annual-accounting-sheet-demo.html?embedded=1&live=1${team === "tax" ? "&team=tax" : ""}${expectedUserId ? `&account=${encodeURIComponent(expectedUserId)}` : ""}&theme=${appearance.theme}&accent=${encodeURIComponent(appearance.accent)}`;
    frame.style.cssText = "display:block;width:100%;height:max(580px,calc(100dvh - 235px));border:0";
    frame.addEventListener("load", () => frame.contentWindow.postMessage({ type: "workspace:status" }, location.origin));
    section.append(frame, loading); document.querySelector("main.main").append(section);
    const sheet = { frame, section, loading, activated: false, ready: false, directoryToken: "" }; sheets.set(team, sheet); return sheet;
  }
  function refreshDirectory(sheet) {
    if (!sheet.directoryToken || !sheet.ready || sheet.section.hidden) return;
    sheet.frame.contentWindow.postMessage({ type: "annual-sheet:directory-changed", token: sheet.directoryToken }, location.origin);
    sheet.directoryToken = "";
  }
  function directoryChanged(token) {
    discardPreload();
    for (const sheet of sheets.values()) { sheet.directoryToken = token; refreshDirectory(sheet); }
  }
  function syncVisibility(state) {
    for (const [team, sheet] of sheets) {
      const show = state.currentView === "matrix-view" && state.operationsMode === "annual" && (state.annualTeam === "tax" ? "tax" : "accounting") === team;
      if (show && sheet.section.hidden && sheet.activated && !sheet.directoryToken) sheet.frame.contentWindow.postMessage({ type: "annual-sheet:refresh" }, location.origin);
      sheet.section.hidden = !show;
      if (show) refreshDirectory(sheet);
      if (show) sheet.activated = true;
    }
  }
  function render(root, state) {
    const team = state.annualTeam === "tax" ? "tax" : "accounting";
    ensure(team);
    const header = document.createElement("section"); header.className = "panel annual-sheet-heading";
    header.innerHTML = `<div class="toolbar"><div class="ops-mode-tabs"><button class="ghost-btn" data-operations-mode="monthly">Monthly Compliance</button><button class="solid-btn" data-operations-mode="annual">Annual Compliance</button></div></div><div class="toolbar" style="margin-top:10px"><div class="workspace-tabs"><button class="${team === "accounting" ? "solid-btn" : "ghost-btn"}" data-annual-team="accounting">Accounting Team</button><button class="${team === "tax" ? "solid-btn" : "ghost-btn"}" data-annual-team="tax">Tax Team</button></div><span class="annual-sheet-connected">Shared annual workspace</span></div>`;
    root.replaceChildren(header); syncVisibility(state);
  }
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || !["annual-sheet:state", "annual-sheet:mounted"].includes(event.data?.type)) return;
    const sheet = sheets.get(event.data.team);
    if (!sheet || event.source !== sheet.frame.contentWindow) return;
    sendAppearance(sheet);
    if (event.data.type === "annual-sheet:mounted") sheet.loading.remove();
    else { sheet.ready = true; refreshDirectory(sheet); if (event.data.saved) { discardPreload(); onSaved(event.data.team); } }
  });
  window.addEventListener("load", schedulePreload);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") { cancelIdle(); discardPreload(); } else schedulePreload(); });
  window.addEventListener("pagehide", () => { pageActive = false; cancelIdle(); discardPreload(); });
  window.addEventListener("pageshow", event => { pageActive = true; if (event.persisted) { preloadAttempted = false; schedulePreload(); } });
  const reconsider = () => { if (!canPreload()) { cancelIdle(); discardPreload(); } else schedulePreload(); };
  navigator.connection?.addEventListener?.("change", reconsider);
  window.addEventListener("resize", reconsider);
  window.AnnualDashboardSheets = {
    render, syncVisibility, directoryChanged, takePreload, clear, setAppearance,
    preload(division) {
      const team = division === "Tax Team" ? "tax" : division === "Accounting Team" ? "accounting" : "";
      if (team !== preferredTeam) { cancelIdle(); discardPreload(); preloadAttempted = false; preferredTeam = team; }
      schedulePreload();
    },
    configure(callback, userId = "") { if (expectedUserId !== userId) clear(); onSaved = callback; expectedUserId = userId; }
  };
})();
