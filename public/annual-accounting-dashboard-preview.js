/* Local-only integration simulation; the normal dashboard never loads this module. */
(() => {
  "use strict";
  if (location.protocol !== "file:" || new URLSearchParams(location.search).get("annualAccountingPreview") !== "1") return;
  const roster = {
    "supervisor-demo": { role: "supervisor", name: "Ivan", team: "Accounting Team" },
    "leader-demo": { role: "leader", name: "Cemari", team: "Accounting Team" },
    "partner-demo": { role: "partner", name: "Partner", team: "Accounting Team" },
    ...Object.fromEntries(["Cemari", "Dewayu", "Dina", "Ivan", "Tantri"].map(name => [`acc-${name.toLowerCase()}`, { role: "staff", name, team: "Accounting Team" }])),
    ...Object.fromEntries(["Bagus", "Denny", "Dimas", "Dinar", "Harry", "Ita", "Okta"].map(name => [`tax-${name.toLowerCase()}`, { role: "staff", name, team: "Tax Team" }]))
  };
  const sheets = {};
  let header, lastState = null, activeActorId = "supervisor-demo", onActorChange = () => {};
  const activeTeam = () => lastState?.annualTeam === "tax" ? "tax" : "accounting";
  function ensureFrame(team) {
    if (sheets[team]) return;
    document.body.classList.add("annual-integration-preview");
    if (!document.querySelector('link[href="annual-accounting-dashboard-preview.css"]')) { const style = document.createElement("link"); style.rel = "stylesheet"; style.href = "annual-accounting-dashboard-preview.css"; document.head.append(style); }
    const section = document.createElement("section"); section.id = team === "tax" ? "annual-tax-integrated-control" : "annual-integrated-control"; section.className = "annual-integrated-control"; section.hidden = true;
    const frame = document.createElement("iframe"); frame.id = team === "tax" ? "annual-tax-integrated-frame" : "annual-integrated-frame"; frame.className = "annual-integrated-frame"; frame.title = `Annual ${team === "tax" ? "Tax" : "Accounting"} editable control sheet`;
    const sheet = { frame, section, actorId: null, pendingActor: activeActorId, metrics: team === "tax" ? { year: 2025, total: 10, open: 8, complete: 2 } : { year: 2025, total: 14, open: 12, complete: 2 } };
    sheets[team] = sheet;
    frame.addEventListener("load", () => frame.contentWindow.postMessage({ type: "annual-preview:set-actor", actorId: activeActorId }, "*"));
    frame.src = `./annual-accounting-sheet-demo.html?embedded=1${team === "tax" ? "&team=tax" : ""}`;
    section.append(frame);
    // Keep the iframe outside view containers that the dashboard replaces during rendering.
    document.querySelector("main.main").append(section);
  }
  function receiveState(event) {
    const team = Object.keys(sheets).find(key => event.source === sheets[key].frame.contentWindow);
    if (!team || event.data?.type !== "annual-accounting-preview:state") return;
    const data = event.data.payload;
    if (!data || data.team && data.team !== team || ![data.year, data.total, data.open, data.complete].every(Number.isInteger) || data.year < 2000 || data.year > 2100 || [data.total, data.open, data.complete].some(value => value < 0) || data.open + data.complete !== data.total || !roster[data.actorId]) return;
    const sheet = sheets[team]; sheet.metrics = { year: data.year, total: data.total, open: data.open, complete: data.complete };
    sheet.actorId = data.actorId;
    if (team === activeTeam() && lastState?.currentView === "matrix-view" && lastState.operationsMode === "annual") {
      if (sheet.pendingActor && sheet.pendingActor !== data.actorId) { sheet.frame.contentWindow.postMessage({ type: "annual-preview:set-actor", actorId: sheet.pendingActor }, "*"); updateChrome(); return; }
      sheet.pendingActor = null; activeActorId = data.actorId;
      onActorChange({ ...roster[data.actorId], id: data.actorId });
    }
    updateChrome();
  }
  function updateChrome() {
    const team = activeTeam(), metrics = sheets[team]?.metrics; if (!metrics) return;
    if (header?.isConnected) {
      header.querySelector("[data-preview-total]").textContent = `${metrics.total} ${team === "tax" ? "SPT subjects" : "annual rows"}`;
      header.querySelector("[data-preview-open]").textContent = `${metrics.open} still open`;
    }
    if (lastState?.currentView === "matrix-view" && lastState.operationsMode === "annual") document.getElementById("workspace-breadcrumb").textContent = `Operations / Annual Compliance / ${team === "tax" ? "Tax" : "Accounting"} / ${metrics.year}`;
  }
  function render(root, state) {
    const team = state.annualTeam === "tax" ? "tax" : "accounting";
    ensureFrame(team);
    header = document.createElement("section"); header.className = "panel annual-integrated-heading";
    header.innerHTML = `<div class="toolbar"><div class="ops-mode-tabs"><button class="ghost-btn" data-operations-mode="monthly">Monthly Compliance</button><button class="solid-btn" data-operations-mode="annual">Annual Compliance</button></div><div class="toolbar-right"><span class="pill neutral" data-preview-total></span><span class="pill warning" data-preview-open></span></div></div><div class="toolbar submenu-secondary-row"><div class="workspace-tabs submenu-secondary" role="group" aria-label="Annual compliance team"><button class="${team === "accounting" ? "solid-btn" : "ghost-btn"}" data-annual-team="accounting">Accounting Team</button><button class="${team === "tax" ? "solid-btn" : "ghost-btn"}" data-annual-team="tax">Tax Team</button></div><span class="annual-preview-label">INTEGRATION PREVIEW</span></div>`;
    const banner = document.createElement("div"); banner.className = "annual-preview-note";
    const description = document.createElement("span"); description.textContent = `Annual ${team === "tax" ? "Tax SPT subject" : "Accounting"} control sheet inside Tax Dashboard. Sample data only; changes stay in this preview until reload.`;
    const link = document.createElement("a"); link.href = team === "tax" ? "./annual-tax-sheet-demo.html" : "./annual-accounting-sheet-demo.html"; link.target = "_blank"; link.rel = "noopener"; link.textContent = "Open standalone";
    banner.append(description, link);
    root.replaceChildren(header, banner);
    syncVisibility(state);
  }
  function syncVisibility(state) {
    lastState = state;
    for (const [team, sheet] of Object.entries(sheets)) {
      sheet.section.hidden = !(state.currentView === "matrix-view" && state.operationsMode === "annual" && activeTeam() === team);
      if (!sheet.section.hidden && sheet.actorId !== activeActorId) { sheet.pendingActor = activeActorId; sheet.frame.contentWindow.postMessage({ type: "annual-preview:set-actor", actorId: activeActorId }, "*"); }
    }
    updateChrome();
  }
  window.AnnualDashboardPreview = { render, syncVisibility, configure(callback) { onActorChange = callback; } };
  window.addEventListener("message", receiveState);
})();
