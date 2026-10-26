/* Production dashboard integration. The sheets authenticate independently; messages never grant access. */
(() => {
  "use strict";
  if (location.protocol === "file:") return;
  const sheets = new Map();
  let onSaved = () => {}, expectedUserId = "";
  function ensure(team) {
    if (sheets.has(team)) return sheets.get(team);
    document.body.classList.add("annual-sheets-enabled");
    if (!document.querySelector('link[data-annual-sheets-style]')) {
      const style = document.createElement("link"); style.rel = "stylesheet"; style.href = "annual-sheet-dashboard.css"; style.dataset.annualSheetsStyle = "yes"; document.head.append(style);
    }
    const section = document.createElement("section"); section.className = "annual-sheet-container"; section.hidden = true; section.style.position = "relative";
    const loading = document.createElement("div"); loading.className = "annual-sheet-loading"; loading.setAttribute("role", "status");
    loading.style.cssText = "position:absolute;inset:0;z-index:1;display:grid;place-content:center;justify-items:center;gap:14px;min-height:300px;background:rgba(242,240,234,.78);backdrop-filter:blur(10px);color:#35575d;font-size:13px";
    loading.innerHTML = '<span class="workspace-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>Loading annual workspace...</span>';
    const frame = document.createElement("iframe"); frame.title = `Annual ${team === "tax" ? "Tax" : "Accounting"} control sheet`; frame.className = "annual-sheet-frame";
    frame.src = `./annual-accounting-sheet-demo.html?embedded=1&live=1${team === "tax" ? "&team=tax" : ""}${expectedUserId ? `&account=${encodeURIComponent(expectedUserId)}` : ""}`;
    frame.style.cssText = "display:block;width:100%;height:max(580px,calc(100dvh - 235px));border:0";
    frame.addEventListener("load", () => frame.contentWindow.postMessage({ type: "workspace:status" }, location.origin));
    section.append(frame, loading); document.querySelector("main.main").append(section);
    const sheet = { frame, section, loading, activated: false }; sheets.set(team, sheet); return sheet;
  }
  function syncVisibility(state) {
    for (const [team, sheet] of sheets) {
      const show = state.currentView === "matrix-view" && state.operationsMode === "annual" && (state.annualTeam === "tax" ? "tax" : "accounting") === team;
      if (show && sheet.section.hidden && sheet.activated) sheet.frame.contentWindow.postMessage({ type: "annual-sheet:refresh" }, location.origin);
      sheet.section.hidden = !show;
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
    if (event.data.type === "annual-sheet:mounted") sheet.loading.remove();
    else if (event.data.saved) onSaved(event.data.team);
  });
  window.AnnualDashboardSheets = { render, syncVisibility, configure(callback, userId = "") { onSaved = callback; expectedUserId = userId; } };
})();
