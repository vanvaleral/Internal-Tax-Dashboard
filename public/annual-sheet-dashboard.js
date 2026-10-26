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
    const section = document.createElement("section"); section.className = "annual-sheet-container"; section.hidden = true;
    const frame = document.createElement("iframe"); frame.title = `Annual ${team === "tax" ? "Tax" : "Accounting"} control sheet`; frame.className = "annual-sheet-frame";
    frame.src = `./annual-accounting-sheet-demo.html?embedded=1&live=1${team === "tax" ? "&team=tax" : ""}${expectedUserId ? `&account=${encodeURIComponent(expectedUserId)}` : ""}`;
    section.append(frame); document.querySelector("main.main").append(section);
    const sheet = { frame, section, activated: false }; sheets.set(team, sheet); return sheet;
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
    if (event.origin !== location.origin || event.data?.type !== "annual-sheet:state") return;
    const sheet = sheets.get(event.data.team);
    if (!sheet || event.source !== sheet.frame.contentWindow) return;
    if (event.data.saved) onSaved(event.data.team);
  });
  window.AnnualDashboardSheets = { render, syncVisibility, configure(callback, userId = "") { onSaved = callback; expectedUserId = userId; } };
})();
