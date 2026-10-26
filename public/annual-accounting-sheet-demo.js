/* Shared annual sheet renderer. Samples by default; authenticated persistence only with live=1. */
(() => {
  "use strict";
  const pageParams = new URLSearchParams(location.search);
  const fullScreenMode = pageParams.get("fullscreen") === "1";
  const liveMode = new URLSearchParams(location.search).get("live") === "1";
  let liveRoster = [], liveReady = false, liveBusy = false;
  let liveEpoch = 0, lastRefreshAt = 0, refreshPromise = null, deferredRefresh = null, lastLiveSnapshot = "", generationLoading = false;
  const embeddedPreview = window.parent !== window && new URLSearchParams(location.search).get("embedded") === "1";
  const taxMode = new URLSearchParams(location.search).get("team") === "tax";
  const taxConfig = taxMode ? window.AnnualTaxSheetConfig : null;
  if (taxMode && !taxConfig) throw new Error("Annual Tax preview configuration is unavailable.");
  if (embeddedPreview) document.documentElement.classList.add("sheet-embedded");
  if (fullScreenMode) document.documentElement.classList.add("sheet-fullscreen");
  if (taxMode) taxConfig.configureUI(document);
  else {
    document.documentElement.classList.add("accounting-sheet");
    document.querySelectorAll('[data-view]:not([data-view="summary"])').forEach(button => button.remove());
    document.querySelector(".view-tabs").setAttribute("aria-label", "Annual accounting summary");
    const help = document.querySelectorAll("#help-panel small");
    help[0].textContent = "Click a segmented bar to reveal its 0-12 month slider. Moving the pointer away restores the segments. F2 or Space opens a selected bar for keyboard adjustment with Arrow keys, Home, or End; Escape closes it. PIC and Progress use single-click dropdowns. Locked rows cannot be changed by drag, paste, or fill.";
    help[1].textContent = "Data Request to In Process fills Data; In Process to Financials Done fills Penyusunan; Equalization to Review fills Admin teknis. NTPE marks Done without checking unfinished controls. Clear NTPE to restore the prior stage. Payment value accepts a non-negative amount or 0 for nil. Demo only; no database changes.";
    document.querySelector(".shortcut-grid span:last-child").textContent = "Progress bars: focus with F2, then Arrow keys / Home / End";
    document.querySelector(".page-foot>span:last-child").textContent = "Drag progress bars / F2 edit / Ctrl+Z undo";
  }
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const stages = taxConfig?.stages || ["Data Request", "In Process", "Financials Done", "Equalization", "Review", "Meeting", "SPT Ready", "Payment", "Reported", "Done"];
  const accPics = liveMode ? [] : ["Cemari", "Dewayu", "Dina", "Ivan", "Tantri"];
  const taxPics = liveMode ? [] : ["Bagus", "Denny", "Dimas", "Dinar", "Harry", "Ita", "Okta"];
  const staffId = (name, team = "acc") => liveMode ? liveRoster.find(person => person.name === name && person.team === (team === "tax" ? "Tax Team" : "Accounting Team"))?.id || "" : name ? `${team}-${name.toLowerCase()}` : "";
  const actors = liveMode ? [] : [
    { id: "supervisor-demo", name: "Supervisor", role: "supervisor" },
    { id: "leader-demo", name: "Team Leader", role: "leader" },
    { id: "partner-demo", name: "Partner", role: "partner" },
    ...accPics.map(name => ({ id: staffId(name), name: `${name} / Accounting`, role: "staff" })),
    ...taxPics.map(name => ({ id: staffId(name, "tax"), name: `${name} / Tax`, role: "staff" }))
  ];
  const controls = taxConfig?.controls || [
    { field: "technicalAdminMonths", title: "Admin teknis", className: "admin" },
    { field: "dataMonths", title: "Data", className: "data" },
    { field: "reportPreparationMonths", title: "Penyusunan", className: "preparation" }
  ];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const controlItems = control => control.items || months;
  const sampleNames = ["PT Bumi Niaga", "CV Allumer Utama", "PT Bali Sentral", "CV Cipta Surya Teknik", "PT Budi Sentosa Ongko W", "PT Eden Restaurant & Events", "CV Cadudasa Pratama", "PT Merah Putih Logistik", "PT Bali Prima Interior", "CV Dasa Cipta", "PT Garuda Diesel Indonesia", "PT Sajanna Property", "CV Belajar Terus Menerus", "PT North Hills Bali", "CV Berpikir Positif", "PT Nusantara Distribusi", "PT Tirta Mandiri", "CV Rupa Ishana"];
  const master = liveMode ? [] : sampleNames.map((name, index) => ({ clientId: `sample-client-${index + 1}`, name, accountingPic: accPics[index % accPics.length], taxPic: taxPics[index % taxPics.length], active: true }));
  let counter = 0;
  function createRow(client, year, outside = false) {
    const id = liveMode ? crypto.randomUUID() : taxMode ? `demo-tax-work-${++counter}` : `demo-work-${++counter}`;
    if (taxMode) { const row = taxConfig.createRow(client, year, id, staffId); if (liveMode) row.subjectId = client.subjectId || id; return row; }
    return { id, clientId: client.clientId || "", clientName: client.name, year, outside, accountingPic: client.accountingPic || "", accountingPicId: staffId(client.accountingPic), taxPic: client.taxPic || "", taxPicId: staffId(client.taxPic, "tax"), assistantIds: [], progress: "Data Request", paymentValue: "", ntpe: "", progressBeforeNtpe: "", deadline: liveMode ? "" : `${year + 1}-04-30`, notes: "", technicalAdminMonths: [], dataMonths: [], reportPreparationMonths: [] };
  }
  function seed() {
    if (liveMode) return [];
    if (taxMode) return taxConfig.seed(staffId);
    const notes = ["Waiting for December bank statements", "Reconcile fixed asset register", "Sales reconciliation in progress", "Awaiting client confirmation", "Equalization: check VAT differences", "Draft financials ready for review", "Follow up missing supplier invoices", "Review supporting schedules", "Director meeting to be scheduled", "Reconcile intercompany balances", "Confirm final tax adjustment", "Filed; receipt retained", "Annual close completed"];
    const progress = ["Data Request", "In Process", "In Process", "Financials Done", "Equalization", "Review", "Data Request", "Review", "Meeting", "In Process", "SPT Ready", "Reported", "Done"];
    const rows = master.slice(0, 13).map((client, index) => {
      const row = createRow(client, 2025);
      row.progress = progress[index]; row.notes = notes[index];
      row.dataMonths = Array.from({ length: index === 0 ? 9 : index === 6 ? 6 : 12 }, (_, month) => month);
      row.reportPreparationMonths = Array.from({ length: index < 3 ? index * 3 : index === 6 ? 4 : 12 }, (_, month) => month);
      row.technicalAdminMonths = Array.from({ length: ["Review", "Meeting", "SPT Ready", "Reported", "Done"].includes(row.progress) ? 12 : index % 7 + 3 }, (_, month) => month);
      if (index === 1) row.assistantIds = [staffId("Cemari")];
      return row;
    });
    const outside = createRow({ name: "PT Sagara Studio / annual assistance", accountingPic: "Cemari", taxPic: "Denny" }, 2025, true);
    outside.notes = "Outside contract: prepare annual financial statements";
    rows.splice(5, 0, outside);
    master.slice(0, 4).forEach(client => { const row = createRow(client, 2024); row.progress = "Done"; controls.forEach(control => { row[control.field] = Array.from({ length: 12 }, (_, i) => i); }); row.notes = "Prior-year annual work"; rows.push(row); });
    return rows;
  }
  const state = { rows: seed(), customColumns: [], year: liveMode ? new Date().getFullYear() - 1 : 2025, view: "summary", status: "incomplete", pic: "", taxPic: "", search: "", sort: { field: "clientName", type: "text", title: taxMode ? "SPT subject" : "Client", direction: "asc" }, actorId: liveMode ? "" : "supervisor-demo", selection: { r: 0, c: 0 }, range: null, history: [], future: [] };
  const requestedYear = pageParams.get("year"), explicitYear = requestedYear !== null && /^(0|20\d{2}|2100)$/.test(requestedYear);
  if (explicitYear) state.year = Number(requestedYear);
  if (["incomplete", "complete", "deleted"].includes(pageParams.get("status"))) state.status = pageParams.get("status");
  if ((taxMode ? ["summary", "documents", "preparation", "filing", "all"] : ["summary"]).includes(pageParams.get("view"))) state.view = pageParams.get("view");
  state.pic = (pageParams.get("pic") || "").slice(0, 180); state.taxPic = (pageParams.get("taxPic") || "").slice(0, 180); state.search = (pageParams.get("search") || "").slice(0, 1000);
  let visible = [], columns = [], drag = null, editor = null, toastTimer;
  let picProgressCollapsed = true;
  let activeRange = null;
  let rowMenuId = "", pendingRowDeletion = null;
  const viewScrollPositions = new Map();
  const done = (row) => ["Reported", "Done"].includes(row.progress) && (!taxMode || row.historicalCompletion || !taxConfig.completionError(row));
  const yearRows = (includeDeleted = false) => state.rows.filter(row => row.year === state.year && (includeDeleted || !row.deletedAt));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const actor = () => actors.find(person => person.id === state.actorId);
  const isLeadership = () => ["leader", "supervisor", "partner", "admin"].includes(actor()?.role);
  const actorAccName = () => accPics.find(name => staffId(name) === state.actorId) || "";
  const actorTaxName = () => taxPics.find(name => staffId(name, "tax") === state.actorId) || "";
  const ownsRow = (row) => (taxMode ? row.taxPicId : row.accountingPicId) === state.actorId || row.assistantIds.includes(state.actorId);
  const canManageRow = row => row && (!liveMode ? isLeadership() || (taxMode ? row.taxPicId : row.accountingPicId) === state.actorId : liveReady && !liveBusy && row.canManageRow);
  function canEdit(row, col) {
    if (liveMode && (!liveReady || liveBusy)) return false;
    if (!row || row.deletedAt || !col || col.type === "summary") return false;
    if (taxMode && ["clientName", "subjectType", "groupName"].includes(col.field)) return isLeadership();
    if (col.field === "clientName") return isLeadership() && row.outside;
    if (["accountingPic", "taxPic", "deadline", "year"].includes(col.field)) return isLeadership();
    return isLeadership() || ownsRow(row);
  }
  function requireEditable(row, col) {
    if (!canEdit(row, col)) throw new Error(["accountingPic", "taxPic", "deadline"].includes(col.field) ? "Only leader, supervisor, or partner can change PIC assignments and deadlines." : taxMode && ["clientName", "subjectType", "groupName"].includes(col.field) ? "Only leadership can change an existing SPT subject's identity or linked group." : col.field === "clientName" && !row.outside ? "Contract client names are maintained in Client Master." : `This annual row is read-only. Only its ${taxMode ? "Tax" : "ACC"} PIC, assigned assistants, or leadership can edit it.`);
  }
  function notify(message) { $("toast").textContent = message; $("toast").hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3300); }
  function change(label, mutate) {
    if (liveMode && (!liveReady || liveBusy)) return;
    const before = { rows: clone(state.rows), customColumns: clone(state.customColumns) };
    mutate();
    if (JSON.stringify(before) === JSON.stringify({ rows: state.rows, customColumns: state.customColumns })) return;
    if (liveMode) {
      const next = { rows: clone(state.rows), customColumns: clone(state.customColumns) };
      state.rows = before.rows; state.customColumns = before.customColumns;
      saveLive(() => window.AnnualSheetLive.commit(before, next, label), label);
      return;
    }
    state.history.push({ ...before, label });
    if (state.history.length > 50) state.history.shift();
    state.future = [];
    render();
    $("save-status").textContent = `${label}. Demo only; no database changes.`;
  }
  function undo() {
    if (liveMode) { if (!editor && !liveBusy && window.AnnualSheetLive.canUndo) saveLive(() => window.AnnualSheetLive.undo(), "Undone"); return; }
    if (editor || !state.history.length) return;
    const previous = state.history.pop(); state.future.push({ rows: clone(state.rows), customColumns: clone(state.customColumns), label: previous.label }); state.rows = previous.rows; state.customColumns = previous.customColumns; state.range = null; render(); notify(`Undone: ${previous.label}`);
  }
  function redo() {
    if (liveMode) { if (!editor && !liveBusy && window.AnnualSheetLive.canRedo) saveLive(() => window.AnnualSheetLive.redo(), "Redone"); return; }
    if (editor || !state.future.length) return;
    const next = state.future.pop(); state.history.push({ rows: clone(state.rows), customColumns: clone(state.customColumns), label: next.label }); state.rows = next.rows; state.customColumns = next.customColumns; state.range = null; render(); notify(`Redone: ${next.label}`);
  }
  function transition(row, next) {
    if (taxMode) { if (["Reported", "Done"].includes(next)) { const error = taxConfig.completionError(row); if (error) throw new Error(error); } row.progress = next; return; }
    if (row.ntpe && next !== "Done") throw new Error("Clear NTPE before reopening this annual row.");
    const previous = row.progress;
    const field = previous === "Data Request" && next === "In Process" ? "dataMonths" : previous === "In Process" && next === "Financials Done" ? "reportPreparationMonths" : previous === "Equalization" && next === "Review" ? "technicalAdminMonths" : "";
    row.progress = next;
    if (field) row[field] = Array.from({ length: 12 }, (_, month) => month);
  }
  function buildColumns(view = state.view) {
    if (taxMode) { const result = taxConfig.buildColumns(view, state.customColumns, accPics, taxPics); if (liveMode && state.year === 0) result.splice(6, 0, { field: "year", title: "Assign tax year", width: 110, type: "number" }); return result; }
    return [
      { field: "clientName", title: "Client / annual engagement", width: 238, type: "text", frozen: true },
      { field: "accountingPic", title: "ACC PIC", width: 90, type: "select", options: ["", ...accPics] },
      { field: "taxPic", title: "Tax PIC", width: 86, type: "select", options: ["", ...taxPics] },
      { field: "progress", title: "Progress", width: 145, type: "select", options: stages },
      ...(liveMode && state.year === 0 ? [{ field: "year", title: "Assign tax year", width: 110, type: "number" }] : []),
      ...controls.map(control => ({ field: control.field, title: control.title, width: 150, type: "range", group: control })),
      { field: "paymentValue", title: "Payment value (Rp)", width: 145, type: "number" },
      { field: "ntpe", title: "NTPE / submit proof no.", width: 185, type: "text" },
      { field: "deadline", title: "Internal deadline", width: 108, type: "date" },
      ...state.customColumns,
      { field: "notes", title: "Note / next action", width: 270, type: "text" }
    ];
  }
  const colLetter = (index) => { let label = ""; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label; return label; };
  function valueAt(row, col) { return col.type === "check" ? row[col.field].includes(col.month) : col.type === "range" ? row[col.field].length : col.type === "summary" ? `${row[col.field].length}/${controlItems(col.group).length}` : row[col.field] ?? ""; }
  function parseValue(col, value) {
    const text = String(value ?? "").trim();
    if (col.type === "range") {
      if (!/^\d+$/.test(text || "0") || Number(text) > 12) throw new Error("Enter a whole number of months from 0 to 12.");
      return Number(text);
    }
    if (col.type === "check") {
      if (["1", "x", "yes", "true", "done", "checked", "✓"].includes(text.toLowerCase())) return true;
      if (["", "0", "no", "false", "-", "·"].includes(text.toLowerCase())) return false;
      throw new Error("Month cells accept X, 1, TRUE, or blank / 0.");
    }
    if (col.type === "select") { const match = col.options.find(option => option.toLowerCase() === text.toLowerCase()); if (match === undefined) throw new Error(`Choose a valid ${col.title}.`); return match; }
    if (col.type === "number") {
      if (!text) return "";
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) || !Number.isFinite(Number(text))) throw new Error("Enter a number without thousands separators, e.g. 1250.50.");
      if (col.field === "payableAmount" && Number(text) < 0) throw new Error("Tax payable cannot be negative. Use 0 for a nil return.");
      if (col.field === "paymentValue" && Number(text) < 0) throw new Error("Payment value cannot be negative. Use 0 for a nil payment.");
      return Number(text);
    }
    if (col.type === "date" && text && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text)) throw new Error("Use a valid date in YYYY-MM-DD format.");
    if (col.field === "clientName" && !text) throw new Error("The client / engagement name cannot be empty.");
    if (text.length > (col.field === "notes" ? 1000 : 180)) throw new Error("This cell exceeds the allowed text length.");
    return text;
  }
  function writeValue(row, col, value) {
    requireEditable(row, col);
    if (col.type === "check") { const monthsSet = new Set(row[col.field]); value ? monthsSet.add(col.month) : monthsSet.delete(col.month); row[col.field] = [...monthsSet].sort((a, b) => a - b); }
    else if (col.type === "range") row[col.field] = Array.from({ length: value }, (_, month) => month);
    else if (col.field === "progress") transition(row, value);
    else if (!taxMode && col.field === "ntpe") {
      if (value && !row.ntpe) { row.progressBeforeNtpe = row.progress; row.progress = "Done"; }
      if (!value && row.ntpe) { row.progress = row.progressBeforeNtpe || row.progress; row.progressBeforeNtpe = ""; }
      row.ntpe = value;
    }
    else {
      row[col.field] = value;
      if (col.field === "accountingPic") row.accountingPicId = staffId(value);
      if (col.field === "taxPic") row.taxPicId = staffId(value, "tax");
    }
  }
  const isSortedColumn = (col) => state.sort.field === col.field && state.sort.month === col.month && state.sort.type === col.type;
  const matchesTaxPic = (row) => !state.taxPic || (state.taxPic === "__unassigned__" ? !row.taxPic : row.taxPic === state.taxPic);
  function sortValue(row) {
    const col = state.sort;
    if (col.type === "summary") return row[col.field].length;
    if (col.field === "progress") return stages.indexOf(row.progress);
    return valueAt(row, col);
  }
  function compareRows(a, b) {
    const av = sortValue(a), bv = sortValue(b);
    const emptyA = av === "" || av === null || av === undefined, emptyB = bv === "" || bv === null || bv === undefined;
    if (emptyA !== emptyB) return emptyA ? 1 : -1;
    const comparison = typeof av === "number" || typeof av === "boolean" ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    return comparison * (state.sort.direction === "asc" ? 1 : -1) || a.clientName.localeCompare(b.clientName) || a.id.localeCompare(b.id);
  }
  function accountingPicProgress(rows) {
    const fields = ["technicalAdminMonths", "dataMonths", "reportPreparationMonths"];
    const emptyCounts = () => Object.fromEntries(fields.map(field => [field, 0]));
    const groups = new Map(accPics.map(name => [staffId(name), { id: staffId(name), name, filter: name, total: 0, completed: 0, monthCounts: emptyCounts() }]));
    for (const row of rows) {
      const name = String(row.accountingPic || "").trim();
      const known = accPics.find(person => person.toLowerCase() === name.toLowerCase());
      const id = row.accountingPicId || (known ? staffId(known) : name ? `name:${name.toLowerCase()}` : "unassigned");
      if (!groups.has(id)) groups.set(id, { id, name: name || "Unassigned", filter: name || "__unassigned__", total: 0, completed: 0, monthCounts: emptyCounts() });
      const group = groups.get(id); group.total++; if (done(row)) group.completed++;
      fields.forEach(field => { group.monthCounts[field] += Array.isArray(row[field]) ? row[field].length : 0; });
    }
    return [...groups.values()].map(group => ({ ...group, remaining: group.total - group.completed, percent: group.total ? Math.round(group.completed / group.total * 1000) / 10 : null, coverage: Object.fromEntries(fields.map(field => [field, group.total ? Math.round(group.monthCounts[field] / (group.total * 12) * 1000) / 10 : null])) }));
  }
  const formatPercent = value => value === null ? "N/A" : `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
  function accountingControlCoverage(rows) {
    const total = rows.length * 12;
    return ["technicalAdminMonths", "dataMonths", "reportPreparationMonths"].map(field => {
      const checked = rows.reduce((sum, row) => sum + (Array.isArray(row[field]) ? row[field].length : 0), 0);
      return { field, checked, total, percent: total ? Math.round(checked / total * 1000) / 10 : null };
    });
  }
  function renderAccountingPicProgress(rows) {
    const show = !taxMode;
    $("accounting-pic-progress").hidden = !show; $("annual-overview").hidden = show;
    if (!show) return;
    const groups = accountingPicProgress(rows).sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101) || b.remaining - a.remaining || a.name.localeCompare(b.name)), completed = rows.filter(done).length;
    $("pic-progress-year").textContent = state.year;
    $("pic-progress-totals").innerHTML = `<span><strong>${rows.length}</strong> clients</span><span><strong>${completed}</strong> done</span><span><strong>${rows.length - completed}</strong> left</span>`;
    $("accounting-pic-progress").classList.toggle("is-collapsed", picProgressCollapsed);
    $("pic-progress-content").hidden = picProgressCollapsed;
    $("toggle-pic-progress").textContent = picProgressCollapsed ? "Show overview" : "Hide overview";
    $("toggle-pic-progress").setAttribute("aria-expanded", String(!picProgressCollapsed));
    $("pic-progress-cards").innerHTML = groups.map(group => `<tr class="pic-progress-card" data-pic-progress-filter="${escape(group.filter)}" data-pic-progress-id="${escape(group.id)}" data-no-work="${!group.total}" tabindex="${group.total ? 0 : -1}" aria-selected="${state.pic === group.filter}" aria-label="${escape(`${group.name}: ${group.completed} of ${group.total} finished, ${group.remaining} left, ${formatPercent(group.percent)} complete. Filter this PIC.`)}"><td>${escape(group.name)}</td><td>${group.completed} / ${group.total}</td><td class="remaining">${group.remaining}</td><td class="pic-card-percent ${group.percent === 0 && group.total ? "not-started" : ""}">${formatPercent(group.percent)}</td></tr>`).join("");
    $("team-control-scope").textContent = `${liveMode && !isLeadership() ? "Accessible ACC work" : "All ACC PICs"} / ${state.year || "Year not set"}`;
    if (liveMode) $("pic-progress-title").firstChild.textContent = isLeadership() ? "Team overview " : "Workload overview ";
    const controlLabels = { technicalAdminMonths: ["Admin teknis", "technical"], dataMonths: ["Data", "data"], reportPreparationMonths: ["Penyusunan", "preparation"] };
    const completionField = `<div class="team-control-field control-complete"><span>Complete</span><strong data-team-complete>${formatPercent(rows.length ? Math.round(completed / rows.length * 1000) / 10 : null)}</strong><small>${completed} / ${rows.length} clients finished</small></div>`;
    const secondaryFields = accountingControlCoverage(rows).map(control => `<div class="team-control-field control-${controlLabels[control.field][1]} ${state.view === control.field ? "is-active" : ""}" title="${control.checked} / ${control.total} months checked"><span>${controlLabels[control.field][0]}</span><strong data-team-control-coverage="${control.field}">${formatPercent(control.percent)}</strong><span class="team-control-meter" aria-hidden="true"><i style="width:${control.percent ?? 0}%"></i></span></div>`).join("");
    $("team-control-values").innerHTML = completionField + `<div class="team-control-secondary">${secondaryFields}</div>`;
    for (const group of groups) if (![...$("pic-filter").options].some(option => option.value === group.filter)) { const option = document.createElement("option"); option.value = group.filter; option.textContent = group.name; $("pic-filter").append(option); }
  }
  function matchesAccPic(row) {
    if (!state.pic) return true;
    if (state.pic === "__unassigned__") return !row.accountingPicId && !String(row.accountingPic || "").trim();
    const known = accPics.find(name => name.toLowerCase() === state.pic.toLowerCase());
    if (known && row.accountingPicId) return row.accountingPicId === staffId(known);
    return String(row.accountingPic || "").trim().toLowerCase() === state.pic.toLowerCase();
  }
  function render() {
    closeRowMenu();
    const scroller = $("grid-scroll"), scrollPosition = { top: scroller.scrollTop, left: scroller.scrollLeft };
    const restoreGridFocus = document.activeElement?.closest("#annual-grid");
    const selectedRowId = visible[state.selection.r]?.id;
    columns = buildColumns();
    if (![...buildColumns("all"), ...buildColumns("summary")].some(isSortedColumn)) state.sort = { field: "clientName", type: "text", title: taxMode ? "SPT subject" : "Client", direction: "asc" };
    const query = state.search.toLowerCase();
    const all = yearRows();
    visible = yearRows(true).filter(row => (state.status === "deleted" ? !!row.deletedAt : !row.deletedAt && done(row) === (state.status === "complete")) && matchesAccPic(row) && matchesTaxPic(row) && (!query || [row.clientName, row.groupName, row.subjectType, row.accountingPic, row.taxPic, row.notes, row.ntpe, row.progress, ...state.customColumns.map(col => row[col.field])].join(" ").toLowerCase().includes(query))).sort(compareRows);
    renderAccountingPicProgress(all);
    $("metric-total").textContent = all.length; $("metric-outside").textContent = taxMode ? `${all.filter(row => row.subjectType === "Individual").length} individual / ${all.filter(row => row.subjectType === "Corporate").length} corporate` : `${all.filter(row => row.outside).length} outside-contract`;
    $("metric-open").textContent = all.filter(row => !done(row)).length; $("metric-done").textContent = all.filter(done).length;
    $("incomplete-count").textContent = all.filter(row => !done(row)).length; $("complete-count").textContent = all.filter(done).length;
    $("deleted-count").textContent = yearRows(true).filter(row => row.deletedAt).length;
    $("empty-generate").hidden = state.status === "deleted";
    $("empty-state").querySelector("strong").textContent = state.status === "deleted" ? "No deleted rows." : "A clear sheet, ready to work.";
    $("empty-state").querySelector("p").textContent = state.status === "deleted" ? "Deleted annual work appears here and can be restored from its row-number menu." : `No ${taxMode ? "SPT subjects" : "clients"} match this year, status, and filter.`;
    const coverageControls = ["all", "summary"].includes(state.view) ? controls : controls.filter(control => control.field === state.view);
    const total = all.length * coverageControls.reduce((sum, control) => sum + controlItems(control).length, 0); const checked = all.reduce((sum, row) => sum + coverageControls.reduce((n, control) => n + row[control.field].length, 0), 0);
    const percent = total ? Math.round(checked / total * 100) : 0;
    $("coverage-label").textContent = ["all", "summary"].includes(state.view) ? "All controls coverage" : `${coverageControls[0].title} coverage`;
    $("coverage-number").textContent = `${percent}%`; $("coverage-fill").style.width = `${percent}%`; $("coverage-caption").textContent = `${checked} of ${total} ${taxMode ? "milestones" : "month cells"} checked`;
    document.querySelectorAll("[data-view]").forEach(button => button.setAttribute("aria-selected", String(button.dataset.view === state.view)));
    document.querySelectorAll("[data-status]").forEach(button => button.setAttribute("aria-selected", String(button.dataset.status === state.status)));
    $("undo-button").disabled = liveMode ? liveBusy || !window.AnnualSheetLive?.canUndo : !state.history.length; $("redo-button").disabled = liveMode ? liveBusy || !window.AnnualSheetLive?.canRedo : !state.future.length;
    $("visible-count").textContent = `${visible.length} ${taxMode ? "subject" : "client"}${visible.length === 1 ? "" : "s"} shown`;
    $("sort-status").textContent = `${state.sort.group ? state.sort.group.title + " / " : ""}${state.sort.title} ${state.sort.direction === "asc" ? "\u2191" : "\u2193"}`;
    $("sort-status").title = "Click a column heading to sort. Click again to reverse.";
    $("access-description").textContent = isLeadership() ? `Edit all work; manage PIC assignments${taxMode ? ", subject identities," : ""} and deadlines.${taxMode ? "" : " Client Master names stay locked."}` : `${actor()?.name || "Loading"}: edit your own ${taxMode ? "Tax" : "ACC"} work and assigned assistance only. PIC and deadline cells stay locked.`;
    $("outside-button").disabled = !isLeadership() && !(taxMode ? actorTaxName() : actorAccName());
    if (liveMode) {
      for (const id of ["generate-button", "empty-generate", "export-button"]) $(id).disabled = !liveReady || liveBusy;
      $("outside-button").disabled ||= !liveReady || liveBusy;
      $("generate-button").disabled ||= state.year === 0;
      $("outside-button").disabled ||= state.year === 0;
    }
    $("add-client-button").disabled = $("generate-button").disabled && $("outside-button").disabled;
    $("export-button").disabled = state.status === "deleted" || liveMode && (!liveReady || liveBusy);
    if ($("add-client-button").disabled) closeAddClientMenu();
    $("fullscreen-button").href = fullScreenUrl();
    document.querySelectorAll("[data-sheet-team]").forEach(link => {
      link.href = fullScreenUrl(link.dataset.sheetTeam);
      if (link.dataset.sheetTeam === (taxMode ? "tax" : "accounting")) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    });
    $("control-description").textContent = taxMode ? state.view === "summary" ? "One row per SPT subject. Click a milestone strip for its checklist; linked companies are references, not new Client Master allocations." : state.view === "filing" || state.view === "all" ? "Enter the tax payable amount (0 for nil), payment date / NTPN when payable, and filing date / NTPE before marking Reported or Done." : `${coverageControls[0].title}: click or drag to mark individual milestones. Progress does not automatically check them.` : "Click a segmented bar to adjust its slider (0-12 months from January); move away to restore the segments. NTPE marks Done and moves the row to Complete. Clearing NTPE restores its previous status.";
    $("control-description").title = $("control-description").textContent;
    if (state.status === "deleted") { $("control-description").textContent = "Deleted rows are read-only. Click a row number and choose Restore Row to return it to the sheet. Client Master and annual history are unchanged."; $("control-description").title = $("control-description").textContent; }
    const table = $("annual-grid");
    table.setAttribute("aria-rowcount", visible.length + 2); table.setAttribute("aria-colcount", columns.length + 1);
    let groups = `<th class="row-number"></th><th class="client-column" data-header-group="identity">Annual work / ${state.year || "Year not set"}</th><th colspan="${3 + (liveMode && state.year === 0 ? 1 : 0)}" data-header-group="ownership">Ownership &amp; progress</th>`;
    coverageControls.forEach(control => { groups += `<th colspan="${state.view === "summary" ? 1 : 12}" class="month-group ${control.className}" data-header-group="${control.className}">${control.title} / ${state.year}</th>`; });
    groups += `<th colspan="2" data-header-group="payment">Payment &amp; filing</th><th data-header-group="deadline">Deadline</th>${state.customColumns.length ? `<th colspan="${state.customColumns.length}" data-header-group="additional">Additional controls</th>` : ""}<th data-header-group="notes">Notes</th>`;
    if (taxMode) {
      groups = `<th class="row-number"></th><th class="client-column">SPT subjects / ${state.year}</th>`;
      for (let c = 1; c < columns.length;) { const col = columns[c]; const title = col.group?.title || col.section || "Payment & follow-through"; let end = c + 1; while (end < columns.length && (columns[end].group?.title || columns[end].section || "Payment & follow-through") === title) end++; groups += `<th colspan="${end - c}" class="${col.group ? `month-group ${col.group.className}` : ""}">${escape(title)}</th>`; c = end; }
    }
    table.querySelector("thead").innerHTML = `<tr class="group-head">${groups}</tr><tr><th class="row-number">#</th>${columns.map((col, c) => {
      const active = isSortedColumn(col); const nextDirection = active && state.sort.direction === "asc" ? "descending" : "ascending";
      const headerGroup = col.group?.className || (col.frozen ? "identity" : ["accountingPic", "taxPic", "progress"].includes(col.field) ? "ownership" : ["paymentValue", "ntpe"].includes(col.field) ? "payment" : col.field === "deadline" ? "deadline" : col.field === "notes" ? "notes" : "additional");
      return `<th class="${col.frozen ? "client-column" : ""} ${col.type === "check" ? "month-head" : ""}" data-header-group="${headerGroup}" aria-sort="${active ? state.sort.direction === "asc" ? "ascending" : "descending" : "none"}"><button type="button" class="column-sort" data-sort-col="${c}" aria-label="Sort ${escape(`${col.group ? col.group.title + " " : ""}${col.title}`)} ${nextDirection}"><span>${col.type === "check" && !taxMode ? col.month + 1 : escape(col.title)}</span><span class="sort-arrow" aria-hidden="true">${active ? state.sort.direction === "asc" ? "&#8593;" : "&#8595;" : "&#8597;"}</span></button></th>`;
    }).join("")}</tr>`;
    let colgroup = table.querySelector("colgroup"); if (!colgroup) { colgroup = document.createElement("colgroup"); table.prepend(colgroup); }
    const narrow = window.matchMedia("(max-width:650px)").matches;
    const widths = [narrow ? 32 : 42, ...columns.map(col => col.frozen && narrow ? 170 : col.width)];
    const minimumWidth = widths.reduce((sum, width) => sum + width, 0);
    // Let only Notes absorb spare width, keeping identity columns stationary across views.
    widths[widths.length - 1] += Math.max(0, scroller.clientWidth - minimumWidth);
    const tableWidth = widths.reduce((sum, width) => sum + width, 0);
    table.style.width = `${tableWidth}px`; table.style.minWidth = `${tableWidth}px`;
    colgroup.innerHTML = widths.map(width => `<col style="width:${width}px">`).join("");
    const lockIcon = `<span class="lock-mark" aria-hidden="true"><svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg></span>`;
    table.querySelector("tbody").innerHTML = visible.map((row, r) => `<tr class="${ownsRow(row) && !isLeadership() ? "row-owned" : ""}"><th class="row-number" scope="row"><button type="button" class="row-number-action" data-row-actions="${escape(row.id)}" aria-label="Actions for row ${r + 1}: ${escape(row.clientName)}" aria-haspopup="menu" aria-expanded="false" ${liveMode && (!liveReady || liveBusy) ? "disabled" : ""}>${r + 1}</button></th>${columns.map((col, c) => {
      const value = valueAt(row, col); let content = escape(value);
      const editable = canEdit(row, col);
      const statusClass = done(row) ? "done" : ["Review", "Equalization", "Meeting"].includes(row.progress) ? "reviewing" : row.progress !== "Data Request" ? "processing" : "";
      if (col.type === "check") content = value ? "&#10003;" : "&middot;";
      else if (col.type === "range") content = `<div class="range-control" data-row-id="${row.id}" data-control-field="${col.field}"><button type="button" tabindex="-1" class="summary-control ${col.group.className}" data-edit-range aria-expanded="false" aria-label="Adjust ${escape(`${col.title}: ${row.clientName}, ${value} of 12 months`)}" ${editable ? "" : "disabled"}><span class="summary-months">${months.map((month, index) => `<i class="${row[col.field].includes(index) ? "on" : ""}" title="${month}"></i>`).join("")}</span><span class="summary-count">${value}/12</span></button><div class="control-slider ${col.group.className}" hidden><input type="range" min="0" max="12" step="1" value="${value}" style="--fill:${value / 12 * 100}%" data-grid-range aria-label="${escape(`${col.title}: ${row.clientName}`)}" aria-valuetext="${value} of 12 months" ${editable ? "" : "disabled"} /><output>${value}/12</output></div></div>`;
      else if (col.type === "summary") content = `<button type="button" class="summary-control ${col.group.className}" data-open-control="${col.field}" data-row-id="${row.id}" aria-label="Open ${col.title} for ${escape(row.clientName)}: ${value}"><span class="summary-months" style="grid-template-columns:repeat(${controlItems(col.group).length},1fr)">${controlItems(col.group).map((month, index) => `<i class="${row[col.field].includes(index) ? "on" : ""}" title="${month}"></i>`).join("")}</span><span class="summary-count">${value}</span></button>`;
      else if (col.type === "select" && editable) content = `<select class="cell-dropdown ${col.field === "progress" ? statusClass : ""}" aria-label="${escape(`${col.title}: ${row.clientName}`)}" data-grid-select="yes">${col.options.map(option => `<option value="${escape(option)}" ${option === value ? "selected" : ""}>${escape(option || "Unassigned")}</option>`).join("")}</select>`;
      else if (col.field === "progress") content = `<span class="status-pill ${statusClass}">${escape(value)}</span>${lockIcon}`;
      else if (col.frozen) content = `<span class="cell-text">${escape(value)}</span>${row.outside && !taxMode ? `<span title="Outside contract" style="color:#a58a4a;font-size:9px">EXT</span>` : ""}${row.assistantIds.length ? `<span class="assist-badge" title="Assigned assistant: ${escape(row.assistantIds.map(id => actors.find(person => person.id === id)?.name || id).join(", "))}">ASSIST</span>` : ""}`;
      else if (!editable) content += lockIcon;
      const hint = !editable && col.type !== "summary" ? "Read-only for this account" : col.type === "range" ? "Click or F2 to adjust completed months from January onward" : col.type === "select" ? "Click to choose" : col.type === "check" ? "Click or drag to mark" : col.type === "summary" ? "Click to open checklist" : "Double-click or F2 to edit";
      return `<td role="gridcell" tabindex="-1" class="cell ${col.frozen ? "client-column" : ""} ${!editable && col.type !== "summary" ? "readonly" : ""} ${col.type === "check" && value ? "checked" : ""}" data-r="${r}" data-c="${c}" data-field="${col.field}" data-type="${col.type}" aria-readonly="${!editable}" aria-label="${escape(`${row.clientName}, ${col.group ? col.group.title + " " : ""}${col.title}: ${col.type === "check" ? value ? "checked" : "unchecked" : value || "empty"}`)}" title="${escape(`${col.group ? col.group.title + " " : ""}${col.title}: ${col.type === "check" ? value ? "checked" : "unchecked" : value || "Empty"} / ${hint}`)}"><div class="cell-content">${content}</div></td>`;
    }).join("")}</tr>`).join("");
    syncRangeEditor();
    $("empty-state").hidden = !!visible.length; table.hidden = !visible.length;
    if (visible.length) { const selectedIndex = visible.findIndex(row => row.id === selectedRowId); state.selection.r = selectedIndex >= 0 ? selectedIndex : Math.min(state.selection.r, visible.length - 1); state.selection.c = Math.min(state.selection.c, columns.length - 1); }
    paintSelection();
    if (restoreGridFocus && visible.length) getCell(state.selection.r, state.selection.c)?.focus({ preventScroll: true });
    scroller.scrollTop = scrollPosition.top; scroller.scrollLeft = scrollPosition.left;
    if (embeddedPreview && !liveMode) sendPreviewState();
  }
  function sendPreviewState() { const all = yearRows(); window.parent.postMessage({ type: "annual-accounting-preview:state", payload: { team: taxMode ? "tax" : "accounting", year: state.year, total: all.length, open: all.filter(row => !done(row)).length, complete: all.filter(done).length, actorId: state.actorId } }, "*"); }
  function getCell(r, c) { return $("annual-grid").querySelector(`td[data-r="${r}"][data-c="${c}"]`); }
  function syncRangeEditor() {
    let found = false;
    document.querySelectorAll(".range-control").forEach(control => {
      const button = control.querySelector("[data-edit-range]");
      const editing = !button.disabled && activeRange?.rowId === control.dataset.rowId && activeRange?.field === control.dataset.controlField;
      if (editing) found = true;
      button.hidden = editing; button.setAttribute("aria-expanded", String(editing));
      control.querySelector(".control-slider").hidden = !editing;
    });
    if (!found) activeRange = null;
  }
  function closeRangeEditor() {
    if (!activeRange) return;
    const focused = document.activeElement?.matches("[data-grid-range]");
    activeRange = null; syncRangeEditor();
    if (focused) getCell(state.selection.r, state.selection.c)?.focus({ preventScroll: true });
  }
  function openRangeEditor(r, c, keyboard = false) {
    const row = visible[r], col = columns[c];
    try { requireEditable(row, col); } catch (error) { notify(error.message); return; }
    if (col.type !== "range") return;
    activeRange = { rowId: row.id, field: col.field, keyboard, dragging: false, outside: false };
    select(r, c); syncRangeEditor();
    const input = getCell(r, c).querySelector("[data-grid-range]");
    input.value = valueAt(row, col); input.style.setProperty("--fill", `${Number(input.value) / 12 * 100}%`);
    input.setAttribute("aria-valuetext", `${input.value} of 12 months`);
    input.nextElementSibling.textContent = `${input.value}/12`;
    input.focus({ preventScroll: true });
  }
  function paintSelection() {
    document.querySelectorAll(".cell.selected, .cell.in-range").forEach(cell => { cell.classList.remove("selected", "in-range"); cell.tabIndex = -1; cell.setAttribute("aria-selected", "false"); });
    const { r, c } = state.selection; const row = visible[r]; const col = columns[c];
    if (!row || !col) { $("cell-value").value = ""; $("cell-value").disabled = true; $("cell-address").textContent = "-"; return; }
    const cell = getCell(r, c); cell.classList.add("selected"); cell.tabIndex = 0; cell.setAttribute("aria-selected", "true");
    const value = valueAt(row, col); $("cell-address").textContent = `${colLetter(c)}${r + 1}`; $("cell-value").value = col.type === "check" ? value ? "TRUE" : "FALSE" : value; $("cell-value").disabled = !canEdit(row, col);
    $("cell-context").textContent = `${col.group ? col.group.title + " / " : ""}${col.title}${canEdit(row, col) ? "" : " / Read-only"}`;
    let count = 1;
    if (state.range) { const range = state.range; for (let rr = Math.min(range.r1, range.r2); rr <= Math.max(range.r1, range.r2); rr++) for (let cc = Math.min(range.c1, range.c2); cc <= Math.max(range.c1, range.c2); cc++) getCell(rr, cc)?.classList.add("in-range"); count = (Math.abs(range.r2 - range.r1) + 1) * (Math.abs(range.c2 - range.c1) + 1); }
    $("selection-count").textContent = `${count} cell${count === 1 ? "" : "s"} selected`;
  }
  function select(r, c, focus = false) { state.selection = { r: Math.max(0, Math.min(r, visible.length - 1)), c: Math.max(0, Math.min(c, columns.length - 1)) }; state.range = null; paintSelection(); if (focus) getCell(state.selection.r, state.selection.c)?.focus({ preventScroll: false }); }
  function changeChecklistView(nextView, rowId = "") {
    if (!finishEdit(true)) return;
    const scroller = $("grid-scroll"), previousView = state.view, previousColumn = columns[state.selection.c];
    const top = scroller.scrollTop, left = scroller.scrollLeft;
    viewScrollPositions.set(`${state.year}:${previousView}`, left);
    state.view = nextView; state.range = null; drag = null;
    const nextColumns = buildColumns();
    let nextColumn = nextColumns.findIndex(col => previousColumn && col.field === previousColumn.field && col.type === previousColumn.type && col.month === previousColumn.month);
    if (rowId || nextColumn < 0 && previousColumn?.group) {
      const group = nextView === "summary" || nextView === "all" ? previousColumn?.group?.field : nextView;
      nextColumn = nextColumns.findIndex(col => col.group?.field === group && (nextView === "summary" || col.month === (rowId ? 0 : previousColumn?.month ?? 0)));
    }
    state.selection.c = Math.max(0, nextColumn);
    if (rowId) { const index = visible.findIndex(row => row.id === rowId); if (index >= 0) state.selection.r = index; }
    render();
    scroller.scrollTop = top;
    scroller.scrollLeft = viewScrollPositions.get(`${state.year}:${nextView}`) ?? (previousView !== "all" && nextView !== "all" ? left : 0);
    if (rowId) getCell(state.selection.r, state.selection.c)?.focus({ preventScroll: true });
  }
  function tabMove(r, c, backwards = false) {
    const next = Math.max(0, Math.min(visible.length * columns.length - 1, r * columns.length + c + (backwards ? -1 : 1)));
    select(Math.floor(next / columns.length), next % columns.length, true);
  }
  function applyEdits(label, edits) {
    edits.forEach(edit => requireEditable(edit.row, edit.col));
    const drafts = new Map();
    edits.forEach(edit => { if (!drafts.has(edit.row)) drafts.set(edit.row, clone(edit.row)); writeValue(drafts.get(edit.row), edit.col, edit.value); });
    change(label, () => drafts.forEach((draft, row) => Object.assign(row, draft)));
  }
  function startEdit(initial) {
    if (editor || !visible.length) return;
    const { r, c } = state.selection; const col = columns[c]; const row = visible[r];
    try { requireEditable(row, col); } catch (error) { notify(error.message); return; }
    if (col.type === "check") return;
    const cell = getCell(r, c);
    if (col.type === "range") { openRangeEditor(r, c, true); return; }
    if (col.type === "select") { const dropdown = cell.querySelector("select"); dropdown.focus(); try { dropdown.showPicker?.(); } catch { /* Native keyboard selection remains available. */ } return; }
    const input = document.createElement("input"); input.type = col.type === "date" ? "date" : "text";
    if (col.type === "number") input.inputMode = "decimal";
    input.value = initial === undefined ? valueAt(row, col) : initial; input.setAttribute("aria-label", `Edit ${col.title}`);
    editor = { input, cell, row, col, r, c }; cell.classList.add("editing"); cell.append(input); input.focus(); if (input.type === "text") initial === undefined ? input.select() : input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener("blur", () => { if (editor?.input === input) finishEdit(true); });
  }
  function finishEdit(save) {
    if (!editor) return true;
    const current = editor; let value;
    if (save) { try { requireEditable(current.row, current.col); value = parseValue(current.col, current.input.value); } catch (error) { notify(error.message); current.input.focus(); return false; } }
    editor = null; current.input.remove(); current.cell.classList.remove("editing");
    if (save) change(`Updated ${current.col.title}`, () => writeValue(current.row, current.col, value));
    else paintSelection();
    return true;
  }
  const table = $("annual-grid");
  function closeRowMenu(focus = false) {
    const previous = rowMenuId; rowMenuId = "";
    $("row-actions-menu").hidden = true;
    document.querySelectorAll("[data-row-actions][aria-expanded=true]").forEach(button => button.setAttribute("aria-expanded", "false"));
    if (focus && previous) [...document.querySelectorAll("[data-row-actions]")].find(button => button.dataset.rowActions === previous)?.focus({ preventScroll: true });
  }
  function openRowMenu(trigger) {
    if (!finishEdit(true) || liveMode && (!liveReady || liveBusy)) return;
    const row = state.rows.find(item => item.id === trigger.dataset.rowActions), index = visible.findIndex(item => item.id === row?.id);
    if (!row || index < 0) return;
    if (rowMenuId === row.id) { closeRowMenu(true); return; }
    closeRowMenu(); select(index, 0); rowMenuId = row.id;
    const menu = $("row-actions-menu"), button = $("manage-row-button"), restore = !!row.deletedAt;
    button.innerHTML = restore ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></svg>Restore Row' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9 7V4.8h6V7m-8 0 .7 12h8.6L17 7M10 10.5v5M14 10.5v5"/></svg>Delete Row';
    button.classList.toggle("is-delete", !restore); button.disabled = !canManageRow(row);
    button.title = button.disabled ? `Only the assigned ${taxMode ? "Tax" : "ACC"} PIC or leadership can ${restore ? "restore" : "delete"} this row.` : "";
    trigger.setAttribute("aria-expanded", "true"); menu.hidden = false;
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.right + 5, window.innerWidth - 188))}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - 56))}px`;
    if (!button.disabled) button.focus({ preventScroll: true });
  }
  $("manage-row-button").addEventListener("click", () => {
    const row = state.rows.find(item => item.id === rowMenuId);
    if (!row || !canManageRow(row)) return;
    closeRowMenu();
    const snapshot = clone(row);
    if (row.deletedAt) { manageSheetRow(snapshot, true); return; }
    pendingRowDeletion = snapshot;
    $("delete-row-name").textContent = `${row.clientName} / ${row.year || "Year not set"}`;
    $("delete-row-dialog").showModal();
  });
  $("confirm-delete-row").addEventListener("click", () => {
    if (!pendingRowDeletion || !$("delete-row-dialog").open) return;
    const row = pendingRowDeletion; pendingRowDeletion = null; $("delete-row-dialog").close(); manageSheetRow(row, false);
  });
  function manageSheetRow(snapshot, restore) {
    if (!canManageRow(snapshot)) return;
    if (liveMode) { saveLive(() => window.AnnualSheetLive.manageRow(snapshot, restore), restore ? "Restored annual row" : "Deleted annual row; recover it from Deleted"); return; }
    change(restore ? "Restored annual row" : "Deleted annual row", () => {
      const row = state.rows.find(item => item.id === snapshot.id);
      row.deletedAt = restore ? "" : new Date().toISOString(); row.deletedByProfileId = restore ? "" : state.actorId;
    });
  }
  document.addEventListener("pointerdown", event => { if (!event.target.closest("#row-actions-menu,[data-row-actions]")) closeRowMenu(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && rowMenuId) { event.preventDefault(); closeRowMenu(true); } });
  $("row-actions-menu").addEventListener("keydown", event => { if (event.key === "Tab") closeRowMenu(); });
  document.addEventListener("scroll", () => closeRowMenu(), true);
  window.addEventListener("resize", () => closeRowMenu());
  document.addEventListener("pointerdown", event => { if (!event.target.closest(".range-control")) closeRangeEditor(); });
  table.addEventListener("pointerout", event => {
    const control = event.target.closest(".range-control");
    if (!activeRange || activeRange.keyboard || !control || control.contains(event.relatedTarget) || control.dataset.rowId !== activeRange.rowId || control.dataset.controlField !== activeRange.field) return;
    if (activeRange.dragging) activeRange.outside = true;
    else closeRangeEditor();
  });
  table.addEventListener("pointerover", event => {
    const control = event.target.closest(".range-control");
    if (activeRange && control?.dataset.rowId === activeRange.rowId && control.dataset.controlField === activeRange.field) activeRange.outside = false;
  });
  table.addEventListener("focusout", event => {
    const control = event.target.closest(".range-control");
    if (control && event.relatedTarget && !control.contains(event.relatedTarget)) closeRangeEditor();
  });
  table.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || editor && editor.cell.contains(event.target)) return;
    const cell = event.target.closest("td[data-r]"); if (!cell) return;
    if (!finishEdit(true)) return;
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c); select(r, c); const col = columns[c];
    if (event.target.matches("[data-grid-range]") && activeRange) { activeRange.dragging = true; activeRange.keyboard = false; }
    if (event.target.closest("select,button,[data-grid-range]")) return;
    if (col.type === "check" && !canEdit(visible[r], col)) { notify(`Read-only: you are not an assigned ${taxMode ? "Tax" : "ACC"} PIC or assistant for this row.`); return; }
    drag = { r, c, endR: r, endC: c, check: col.type === "check", value: !valueAt(visible[r], col), field: col.field };
    if (event.pointerType === "mouse") { event.preventDefault(); getCell(r, c)?.focus({ preventScroll: true }); }
  });
  document.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest("td[data-r]"); if (!cell) return;
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    if (drag.check && (r !== drag.r || columns[c].field !== drag.field)) return;
    drag.endR = r; drag.endC = c; state.range = { r1: drag.r, c1: drag.c, r2: r, c2: c }; paintSelection();
  });
  document.addEventListener("pointerup", () => {
    if (activeRange) { activeRange.dragging = false; if (activeRange.outside) closeRangeEditor(); }
    if (!drag) return; const current = drag; drag = null;
    if (current.check) { const row = visible[current.r]; const edits = []; for (let c = Math.min(current.c, current.endC); c <= Math.max(current.c, current.endC); c++) edits.push({ row, col: columns[c], value: current.value }); try { applyEdits(`${current.value ? "Checked" : "Cleared"} ${edits.length} ${taxMode ? "milestone(s)" : "month cell(s)"}`, edits); } catch (error) { notify(error.message); } getCell(state.selection.r, state.selection.c)?.focus({ preventScroll: true }); }
  });
  document.addEventListener("pointercancel", () => { drag = null; closeRangeEditor(); state.range = null; paintSelection(); });
  table.addEventListener("dblclick", (event) => { if (!event.target.matches("[data-grid-range]") && event.target.closest("td[data-r]")) startEdit(); });
  table.addEventListener("input", (event) => {
    const input = event.target;
    if (!input.matches("[data-grid-range]")) return;
    const cell = input.closest("td"), row = visible[Number(cell.dataset.r)], col = columns[Number(cell.dataset.c)];
    if (!canEdit(row, col)) { input.value = valueAt(row, col); return; }
    input.style.setProperty("--fill", `${Number(input.value) / 12 * 100}%`);
    input.setAttribute("aria-valuetext", `${input.value} of 12 months`);
    input.nextElementSibling.textContent = `${input.value}/12`;
  });
  table.addEventListener("change", (event) => {
    if (!event.target.matches("[data-grid-select],[data-grid-range]")) return;
    const restoreSliderFocus = event.target.matches("[data-grid-range]") && document.activeElement === event.target && !!activeRange;
    const cell = event.target.closest("td"); const row = visible[Number(cell.dataset.r)], col = columns[Number(cell.dataset.c)];
    select(Number(cell.dataset.r), Number(cell.dataset.c));
    try { applyEdits(`Updated ${col.title}`, [{ row, col, value: parseValue(col, event.target.value) }]); } catch (error) { event.target.value = valueAt(row, col); notify(error.message); }
    const selectedCell = getCell(state.selection.r, state.selection.c);
    (restoreSliderFocus ? selectedCell?.querySelector("[data-grid-range]") : selectedCell)?.focus({ preventScroll: true });
  });
  table.addEventListener("click", (event) => {
    const rowAction = event.target.closest("[data-row-actions]");
    if (rowAction) { openRowMenu(rowAction); return; }
    const rangeButton = event.target.closest("[data-edit-range]");
    if (rangeButton) { const cell = rangeButton.closest("td"); openRangeEditor(Number(cell.dataset.r), Number(cell.dataset.c), event.detail === 0); return; }
    const heading = event.target.closest("[data-sort-col]");
    if (heading) {
      if (!finishEdit(true)) return;
      const col = columns[Number(heading.dataset.sortCol)];
      state.sort = { ...col, direction: isSortedColumn(col) && state.sort.direction === "asc" ? "desc" : "asc" };
      drag = null; state.range = null; render();
      return;
    }
    const button = event.target.closest("[data-open-control]"); if (!button) return;
    changeChecklistView(button.dataset.openControl, button.dataset.rowId);
  });
  table.addEventListener("keydown", (event) => {
    const rowAction = event.target.closest("[data-row-actions]");
    if (rowAction) { if (["Enter", " ", "ArrowDown"].includes(event.key)) { event.preventDefault(); openRowMenu(rowAction); } return; }
    if (editor) { if (event.key === "Escape") { event.preventDefault(); finishEdit(false); getCell(state.selection.r, state.selection.c)?.focus(); } else if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); const { r, c } = editor; if (finishEdit(true)) event.key === "Tab" ? tabMove(r, c, event.shiftKey) : select(r + (event.shiftKey ? -1 : 1), c, true); } return; }
    const { r, c } = state.selection; const row = visible[r], col = columns[c]; if (!row || !col) return;
    if (event.target.matches("[data-grid-range]")) {
      if (event.key === "Tab") { event.preventDefault(); closeRangeEditor(); tabMove(r, c, event.shiftKey); }
      else if (event.key === "Escape" || event.key === "Enter") { event.preventDefault(); closeRangeEditor(); }
      return;
    }
    if (event.target.matches("[data-grid-select]")) {
      if (event.key === "Escape") { event.preventDefault(); getCell(r, c)?.focus(); }
      else if (event.key === "Tab") { event.preventDefault(); tabMove(r, c, event.shiftKey); }
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (modifier && event.key.toLowerCase() === "d") {
      event.preventDefault(); const range = state.range;
      if (!range || range.r1 === range.r2) { notify("Select two or more rows with Shift + Arrow, then Ctrl+D to fill down."); return; }
      const edits = []; const firstRow = Math.min(range.r1, range.r2);
      try { for (let rr = firstRow + 1; rr <= Math.max(range.r1, range.r2); rr++) for (let cc = Math.min(range.c1, range.c2); cc <= Math.max(range.c1, range.c2); cc++) edits.push({ row: visible[rr], col: columns[cc], value: parseValue(columns[cc], valueAt(visible[firstRow], columns[cc])) }); applyEdits(`Filled ${edits.length} cell(s) down`, edits); } catch (error) { notify(`${error.message} Nothing was filled.`); }
    }
    else if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); if (col.type === "select") startEdit(); }
    else if (moves[event.key]) {
      event.preventDefault(); const [dr, dc] = moves[event.key];
      if (event.shiftKey) { const range = state.range || { r1: r, c1: c, r2: r, c2: c }; state.range = { ...range, r2: Math.max(0, Math.min(visible.length - 1, range.r2 + dr)), c2: Math.max(0, Math.min(columns.length - 1, range.c2 + dc)) }; paintSelection(); getCell(state.range.r2, state.range.c2)?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }
      else select(r + dr, c + dc, true);
    }
    else if (event.key === "Tab") { event.preventDefault(); tabMove(r, c, event.shiftKey); }
    else if (event.key === "Enter") { event.preventDefault(); select(r + (event.shiftKey ? -1 : 1), c, true); }
    else if (event.key === "Home" || event.key === "End") { event.preventDefault(); select(modifier ? event.key === "Home" ? 0 : visible.length - 1 : r, event.key === "Home" ? 0 : columns.length - 1, true); }
    else if (event.key === "F2") { event.preventDefault(); startEdit(); }
    else if (event.key === " " && col.type === "range") { event.preventDefault(); openRangeEditor(r, c, true); }
    else if (event.key === " " && col.type === "check") { event.preventDefault(); try { applyEdits("Toggled month", [{ row, col, value: !valueAt(row, col) }]); } catch (error) { notify(error.message); } }
    else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); const range = state.range || { r1: r, r2: r, c1: c, c2: c }; const edits = []; try { for (let rr = Math.min(range.r1, range.r2); rr <= Math.max(range.r1, range.r2); rr++) for (let cc = Math.min(range.c1, range.c2); cc <= Math.max(range.c1, range.c2); cc++) edits.push({ row: visible[rr], col: columns[cc], value: parseValue(columns[cc], "") }); applyEdits("Cleared selection", edits); } catch (error) { notify(error.message); } }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && ["text", "number"].includes(col.type)) { event.preventDefault(); startEdit(event.key); }
  });
  document.addEventListener("keydown", (event) => {
    if (editor || event.target.closest?.("input,select,textarea") || document.querySelector("dialog[open]")) return;
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); event.key.toLowerCase() === "y" || event.shiftKey ? redo() : undo(); }
  });
  table.addEventListener("copy", (event) => {
    if (editor) return; const { r, c } = state.selection; const range = state.range || { r1: r, r2: r, c1: c, c2: c }; const lines = [];
    for (let rr = Math.min(range.r1, range.r2); rr <= Math.max(range.r1, range.r2); rr++) { const cells = []; for (let cc = Math.min(range.c1, range.c2); cc <= Math.max(range.c1, range.c2); cc++) cells.push(String(valueAt(visible[rr], columns[cc])).replace(/[\t\r\n]/g, " ")); lines.push(cells.join("\t")); }
    event.preventDefault(); event.clipboardData.setData("text/plain", lines.join("\n")); notify("Selection copied. Paste into Excel or another cell.");
  });
  table.addEventListener("paste", (event) => {
    if (editor) return; event.preventDefault();
    const source = event.clipboardData.getData("text/plain").replace(/\r\n/g, "\n").replace(/\n$/, ""); if (!source) return;
    const data = source.split("\n").map(line => line.split("\t")); const { r, c } = state.selection; const edits = [];
    try {
      if (r + data.length > visible.length || data.some(line => c + line.length > columns.length)) throw new Error("Paste exceeds the visible sheet. Select a smaller range or generate the missing client rows first.");
      data.forEach((line, dr) => line.forEach((value, dc) => edits.push({ row: visible[r + dr], col: columns[c + dc], value: parseValue(columns[c + dc], value) })));
      applyEdits(`Pasted ${edits.length} cell(s)`, edits);
    } catch (error) { notify(`${error.message} Nothing was pasted.`); }
  });
  $("cell-value").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); const row = visible[state.selection.r], col = columns[state.selection.c]; try { const value = parseValue(col, event.target.value); change(`Updated ${col.title}`, () => writeValue(row, col, value)); getCell(state.selection.r, state.selection.c)?.focus(); } catch (error) { notify(error.message); } } else if (event.key === "Escape") { paintSelection(); getCell(state.selection.r, state.selection.c)?.focus(); } });
  $("actor-select").innerHTML = actors.map(person => `<option value="${person.id}">${escape(person.name)}</option>`).join("");
  function setActor(id) {
    if (liveMode) return;
    if (!actors.some(person => person.id === id)) return;
    if (id === state.actorId) { if (embeddedPreview) sendPreviewState(); return; }
    finishEdit(false); drag = null; state.actorId = id; state.range = null; state.history = []; state.future = [];
    $("actor-select").value = id;
    document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
    render();
    $("save-status").textContent = `Previewing ${actor().name}. Sample permissions only; production will require server checks.`;
  }
  $("actor-select").addEventListener("change", event => setActor(event.target.value));
  if (embeddedPreview) window.addEventListener("message", event => { if (event.source === window.parent && event.data?.type === "annual-preview:set-actor") setActor(event.data.actorId); });
  $("pic-filter").innerHTML += accPics.map(pic => `<option>${pic}</option>`).join("");
  $("toggle-pic-progress").addEventListener("click", () => { if (!finishEdit(true)) return; picProgressCollapsed = !picProgressCollapsed; render(); });
  $("pic-progress-cards").addEventListener("click", event => {
    const card = event.target.closest("[data-pic-progress-filter]"); if (!card || card.dataset.noWork === "true" || !finishEdit(true)) return;
    state.pic = state.pic === card.dataset.picProgressFilter ? "" : card.dataset.picProgressFilter;
    $("pic-filter").value = state.pic; state.range = null; render();
  });
  $("pic-progress-cards").addEventListener("keydown", event => { if (["Enter", " "].includes(event.key) && event.target.matches("[data-pic-progress-filter]")) { event.preventDefault(); event.target.click(); } });
  $("pic-filter").addEventListener("change", event => { finishEdit(false); state.pic = event.target.value; state.range = null; render(); });
  $("tax-pic-filter").innerHTML += taxPics.map(pic => `<option>${pic}</option>`).join("");
  $("tax-pic-filter").addEventListener("change", event => { finishEdit(false); state.taxPic = event.target.value; state.range = null; render(); });
  $("reset-filters").addEventListener("click", () => {
    if (!finishEdit(true)) return;
    state.pic = ""; state.taxPic = ""; state.search = "";
    state.sort = { field: "clientName", type: "text", title: taxMode ? "SPT subject" : "Client", direction: "asc" };
    state.range = null; drag = null;
    $("pic-filter").value = ""; $("tax-pic-filter").value = ""; $("search").value = "";
    render();
    notify(`Filters cleared. ${taxMode ? "SPT subjects" : "Client names"} sorted A to Z.`);
  });
  $("year-select").addEventListener("change", event => { finishEdit(false); state.year = Number(event.target.value); state.selection = { r: 0, c: 0 }; state.range = null; render(); });
  $("search").addEventListener("input", event => { state.search = event.target.value; state.range = null; render(); });
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => { if (button.dataset.view !== state.view) changeChecklistView(button.dataset.view); }));
  document.querySelectorAll("[data-status]").forEach(button => button.addEventListener("click", () => { finishEdit(false); state.status = button.dataset.status; state.selection.r = 0; state.range = null; render(); }));
  $("undo-button").addEventListener("click", undo); $("redo-button").addEventListener("click", redo);
  $("help-button").addEventListener("click", () => { $("help-panel").hidden = !$("help-panel").hidden; $("help-button").setAttribute("aria-expanded", String(!$("help-panel").hidden)); });
  function closeAddClientMenu(focus = false) {
    $("add-client-menu").hidden = true; $("add-client-button").setAttribute("aria-expanded", "false");
    if (focus) $("add-client-button").focus();
  }
  $("add-client-button").addEventListener("click", () => {
    const show = $("add-client-menu").hidden;
    $("add-client-menu").hidden = !show; $("add-client-button").setAttribute("aria-expanded", String(show));
  });
  document.addEventListener("click", event => { if (!event.target.closest(".add-client-actions")) closeAddClientMenu(); });
  document.querySelector(".add-client-actions").addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); closeAddClientMenu(true); } });
  document.querySelector(".add-client-actions").addEventListener("focusout", event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) closeAddClientMenu(); });
  function fullScreenUrl(team = taxMode ? "tax" : "accounting") {
    const url = new URL("./annual-accounting-sheet-demo.html", location.href), params = url.searchParams;
    params.set("fullscreen", "1"); if (team === "tax") params.set("team", "tax");
    if (liveMode) { params.set("live", "1"); if (pageParams.get("account")) params.set("account", pageParams.get("account")); }
    params.set("year", state.year); params.set("status", state.status);
    for (const [key, value] of [["pic", state.pic], ["taxPic", state.taxPic], ["search", state.search]]) if (value) params.set(key, value);
    if (team === (taxMode ? "tax" : "accounting")) {
      params.set("view", state.view); params.set("sort", state.sort.field); params.set("direction", state.sort.direction);
      if (state.sort.month !== undefined) params.set("month", state.sort.month);
    }
    return url.href;
  }
  function guardFullScreenNavigation(event) {
    if (!finishEdit(true) || liveBusy || liveMode && !liveReady) { event.preventDefault(); notify("Wait for the current database save to finish before opening another annual sheet."); return; }
    event.currentTarget.href = event.currentTarget.dataset.sheetTeam ? fullScreenUrl(event.currentTarget.dataset.sheetTeam) : fullScreenUrl();
  }
  $("fullscreen-button").addEventListener("click", guardFullScreenNavigation);
  document.querySelectorAll("[data-sheet-team]").forEach(link => link.addEventListener("click", guardFullScreenNavigation));
  const generationKey = row => taxMode ? row.subjectId : row.clientId;
  const generationCandidates = () => (taxMode ? taxConfig.priorCandidates(state) : master).filter(client => (taxMode || client.active && client.accountingPic) && matchesAccPic(client) && matchesTaxPic(client) && (isLeadership() || (taxMode ? client.taxPicId || staffId(client.taxPic, "tax") : client.accountingPicId || staffId(client.accountingPic)) === state.actorId));
  async function showGeneration() {
    closeAddClientMenu();
    if (liveMode && (!liveReady || liveBusy || state.year === 0)) return;
    if (generationLoading) return;
    if (liveMode && !taxMode) {
      generationLoading = true; $("generate-button").disabled = true; $("candidate-list").textContent = "Loading eligible clients...";
      $("candidate-summary").textContent = "Checking current Client Master assignments"; $("confirm-generate").disabled = true; $("candidate-all").disabled = true;
      $("generate-year").textContent = state.year; $("generate-dialog").showModal();
      const epoch = liveEpoch, year = state.year;
      try {
        const candidates = await window.AnnualSheetLive.loadClients();
        if (epoch !== liveEpoch || year !== state.year || !$("generate-dialog").open) return;
        master.splice(0, master.length, ...candidates.map(client => ({ ...client, accountingPic: liveRoster.find(person => person.id === client.accountingPicId)?.name || client.accountingPic, taxPic: liveRoster.find(person => person.id === client.taxPicId)?.name || client.taxPic })));
      } catch (error) { if ([401, 403, 409].includes(error.status)) clearLiveAccess(); else { $("candidate-list").textContent = error.message; $("candidate-summary").textContent = "Close and retry Generate Clients."; } return; }
      finally { generationLoading = false; $("generate-button").disabled = liveBusy || !liveReady || state.year === 0; }
    }
    $("generate-year").textContent = state.year;
    const existing = new Set(yearRows().map(generationKey).filter(Boolean));
    const eligible = generationCandidates();
    $("candidate-list").innerHTML = eligible.map(client => `<label class="candidate"><input type="checkbox" value="${client.clientId}" ${existing.has(client.clientId) ? "disabled" : taxMode ? "" : "checked"} /><span><strong>${escape(client.name)}</strong><small>${taxMode ? `${escape(client.subjectType)} / ${escape(client.groupName || "Independent")} / ` : ""}ACC: ${escape(client.accountingPic || "Unassigned")} / Tax: ${escape(client.taxPic)}</small></span>${existing.has(client.clientId) ? `<span class="existing">Already generated</span>` : ""}</label>`).join("") || `<p class="form-hint">${taxMode ? "No earlier-year subjects match this scope. Use Add SPT subject for a new taxpayer." : "No eligible clients match this scope."}</p>`;
    const remaining = eligible.filter(client => !existing.has(client.clientId)).length;
    $("candidate-summary").textContent = `${remaining} available / ${eligible.length - remaining} already in sheet`;
    $("candidate-all").checked = remaining > 0 && !taxMode; $("candidate-all").indeterminate = false; $("candidate-all").disabled = !remaining; $("confirm-generate").disabled = !remaining || taxMode;
    if (!$("generate-dialog").open) $("generate-dialog").showModal();
  }
  $("generate-button").addEventListener("click", showGeneration); $("empty-generate").addEventListener("click", showGeneration);
  $("candidate-all").addEventListener("change", event => { $("candidate-list").querySelectorAll("input:not(:disabled)").forEach(input => { input.checked = event.target.checked; }); $("confirm-generate").disabled = !event.target.checked; });
  $("candidate-list").addEventListener("change", () => { const inputs = [...$("candidate-list").querySelectorAll("input:not(:disabled)")]; const selected = inputs.filter(input => input.checked).length; $("candidate-all").checked = selected === inputs.length; $("candidate-all").indeterminate = selected > 0 && selected < inputs.length; $("confirm-generate").disabled = !selected; });
  $("confirm-generate").addEventListener("click", () => {
    const selected = [...$("candidate-list").querySelectorAll("input:checked:not(:disabled)")].map(input => input.value);
    const existing = new Set(yearRows().map(generationKey)); const candidates = generationCandidates().filter(client => selected.includes(client.clientId) && !existing.has(client.clientId));
    change(`Generated ${candidates.length} ${taxMode ? "SPT subject(s)" : "annual client(s)"} for ${state.year}`, () => candidates.forEach(client => state.rows.push(createRow(client, state.year))));
    state.status = "incomplete"; $("generate-dialog").close(); render(); if (!liveMode) notify(`${candidates.length} ${taxMode ? "SPT subject(s)" : "client(s)"} added. Previous years remain separate.`);
  });
  $("outside-button").addEventListener("click", () => {
    closeAddClientMenu();
    if (taxMode) { showTaxSubjectForm(); return; }
    if (!isLeadership() && !actorAccName()) { notify("Only an ACC PIC or leadership can add annual accounting work."); return; }
    const form = $("outside-form"); form.reset();
    form.elements.accountingPic.disabled = !isLeadership(); form.elements.taxPic.disabled = !isLeadership();
    if (!isLeadership()) { form.elements.accountingPic.value = actorAccName(); form.elements.taxPic.value = ""; }
    $("outside-dialog").showModal();
  });
  function showTaxSubjectForm() {
    if (!isLeadership() && !actorTaxName()) { notify("Only a Tax PIC or leadership can add an SPT subject."); return; }
    const form = $("tax-subject-form"); form.reset(); $("tax-subject-error").hidden = true;
    form.elements.taxPic.innerHTML = `<option value="">Select Tax PIC</option>${taxPics.map(name => `<option>${name}</option>`).join("")}`;
    form.elements.accountingPic.innerHTML = `<option value="">Unassigned</option>${accPics.map(name => `<option>${name}</option>`).join("")}`;
    form.elements.taxPic.disabled = !isLeadership(); form.elements.accountingPic.disabled = !isLeadership();
    if (actorTaxName()) form.elements.taxPic.value = actorTaxName();
    $("tax-subject-dialog").showModal();
  }
  $("tax-subject-form").addEventListener("submit", event => {
    event.preventDefault(); if (!taxMode) return;
    const form = new FormData(event.target), error = $("tax-subject-error"); error.hidden = true;
    if (!isLeadership() && !actorTaxName()) { error.textContent = "Only a Tax PIC or leadership can add an SPT subject."; error.hidden = false; return; }
    const name = String(form.get("name") || "").trim(), groupName = String(form.get("groupName") || "").trim(), subjectType = String(form.get("subjectType") || "Individual");
    const taxPic = isLeadership() ? String(form.get("taxPic") || "") : actorTaxName();
    const accountingPic = isLeadership() ? String(form.get("accountingPic") || "") : "";
    if (!name || name.length > 160 || !["Individual", "Corporate"].includes(subjectType) || !taxPics.includes(taxPic) || accountingPic && !accPics.includes(accountingPic)) { error.textContent = "Enter the subject name, a valid type, and an active Tax PIC."; error.hidden = false; return; }
    if (yearRows().some(row => row.clientName.toLowerCase() === name.toLowerCase() && row.subjectType === subjectType && row.groupName.toLowerCase() === groupName.toLowerCase())) { error.textContent = "This subject, type, and linked group are already on this year's sheet."; error.hidden = false; return; }
    change("Added SPT subject", () => { const row = createRow({ name, groupName, subjectType, taxPic, accountingPic }, state.year); row.notes = String(form.get("notes") || "").trim(); state.rows.push(row); });
    state.status = "incomplete"; state.search = ""; state.pic = ""; state.taxPic = "";
    $("search").value = ""; $("pic-filter").value = ""; $("tax-pic-filter").value = "";
    $("tax-subject-dialog").close(); render();
  });
  document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => $(button.dataset.close).close()));
  $("outside-form").addEventListener("submit", event => { event.preventDefault(); const form = new FormData(event.target); const name = String(form.get("name") || "").trim(); if (!name) return; if (!isLeadership() && !actorAccName()) { notify("Only an ACC PIC or leadership can add annual accounting work."); return; } change("Added outside-contract annual work", () => { const row = createRow({ name, accountingPic: isLeadership() ? String(form.get("accountingPic") || "") : actorAccName(), taxPic: isLeadership() ? String(form.get("taxPic") || "") : "" }, state.year, true); row.notes = String(form.get("notes") || "").trim(); state.rows.push(row); }); state.status = "incomplete"; state.search = ""; $("search").value = ""; state.pic = ""; $("pic-filter").value = ""; state.taxPic = ""; $("tax-pic-filter").value = ""; $("outside-dialog").close(); render(); });
  let excelLibraryPromise;
  function loadExcelLibrary() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!excelLibraryPromise) excelLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("./vendor/xlsx.full.min.js", document.baseURI).href;
      script.onload = () => { if (window.XLSX) resolve(window.XLSX); else { excelLibraryPromise = null; script.remove(); reject(new Error("Excel export library could not be initialized. Please retry.")); } };
      script.onerror = () => { excelLibraryPromise = null; script.remove(); reject(new Error("Excel export library could not be loaded. Please retry.")); };
      document.head.append(script);
    });
    return excelLibraryPromise;
  }
  function buildExportWorkbook(XLSX, snapshot) {
    if (taxMode) return taxConfig.buildWorkbook(XLSX, snapshot);
    const rows = snapshot.rows.filter(row => !row.deletedAt).sort((a, b) => a.clientName.localeCompare(b.clientName));
    const custom = snapshot.customColumns;
    const completed = rows.filter(done).length;
    const scope = `All ${rows.length} annual client(s): ${rows.length - completed} incomplete, ${completed} complete. Search and PIC filters are not applied.`;
    const asDate = value => value ? new Date(`${value}T00:00:00Z`) : "";
    const customValues = row => custom.map(col => col.type === "date" ? asDate(row[col.field]) : row[col.field] ?? "");
    const summaryHeaders = ["No.", "Client / annual engagement", "Completion", "Engagement", "ACC PIC", "Tax PIC", "Admin teknis (months)", "Data (months)", "Penyusunan (months)", "Checklist coverage", "Progress", "Payment value (Rp)", "NTPE / submit proof no.", "Internal deadline", ...custom.map(col => col.title), "Note / next action", "Annual Work ID"];
    const summaryData = [
      ["LMATS Consulting"], [`Annual accounting summary - Tax year ${snapshot.year}`],
      [scope], ["Monthly counts are out of 12. Checklist coverage is checked months across all three controls out of 36."],
      summaryHeaders,
      ...rows.map((row, index) => [index + 1, row.clientName, done(row) ? "Complete" : "Incomplete", row.outside ? "Outside contract" : "Contract", row.accountingPic, row.taxPic || "Unassigned", row.technicalAdminMonths.length, row.dataMonths.length, row.reportPreparationMonths.length, controls.reduce((sum, control) => sum + row[control.field].length, 0) / 36, row.progress, row.paymentValue ?? "", row.ntpe || "", asDate(row.deadline), ...customValues(row), row.notes, row.id])
    ];
    const monthColumns = controls.flatMap(control => months.map((month, index) => ({ field: control.field, month: index, title: `${control.title} ${month}` })));
    const detailHeaders = ["No.", "Client / annual engagement", "Completion", "Engagement", "ACC PIC", "Tax PIC", "Progress", ...monthColumns.map(col => col.title), "Payment value (Rp)", "NTPE / submit proof no.", "Internal deadline", ...custom.map(col => col.title), "Note / next action", "Annual Work ID"];
    const detailData = [
      ["LMATS Consulting"], [`Annual monthly controls - Tax year ${snapshot.year}`],
      [scope], ["X = month checked. Blank = month not checked."],
      detailHeaders,
      ...rows.map((row, index) => [index + 1, row.clientName, done(row) ? "Complete" : "Incomplete", row.outside ? "Outside contract" : "Contract", row.accountingPic, row.taxPic || "Unassigned", row.progress, ...monthColumns.map(col => row[col.field].includes(col.month) ? "X" : ""), row.paymentValue ?? "", row.ntpe || "", asDate(row.deadline), ...customValues(row), row.notes, row.id])
    ];
    function createSheet(data, widths) {
      const sheet = XLSX.utils.aoa_to_sheet(data, { cellDates: true, dateNF: "yyyy-mm-dd" });
      const lastCol = data[4].length - 1;
      sheet["!cols"] = widths.map(wch => ({ wch }));
      sheet["!rows"] = [{ hpt: 22 }, { hpt: 24 }, { hpt: 20 }, { hpt: 20 }, { hpt: 24 }];
      sheet["!merges"] = [0, 1, 2, 3].map(r => ({ s: { r, c: 0 }, e: { r, c: lastCol } }));
      sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: data.length - 1, c: lastCol } }) };
      return sheet;
    }
    const customWidths = custom.map(col => Math.max(col.type === "date" ? 16 : 22, Math.min(48, col.title.length + 3)));
    const summary = createSheet(summaryData, [6, 46, 14, 20, 16, 16, 23, 18, 23, 21, 22, 23, 28, 20, ...customWidths, 65, 28]);
    const detail = createSheet(detailData, [6, 46, 14, 20, 16, 16, 22, ...monthColumns.map(col => col.title.length + 3), 23, 28, 20, ...customWidths, 65, 28]);
    for (let r = 5; r < summaryData.length; r++) {
      summary[XLSX.utils.encode_cell({ r, c: 9 })].z = "0.0%";
      custom.forEach((col, index) => { if (col.type !== "number") return; const summaryCell = summary[XLSX.utils.encode_cell({ r, c: 14 + index })]; const detailCell = detail[XLSX.utils.encode_cell({ r, c: 46 + index })]; if (summaryCell?.t === "n") summaryCell.z = "#,##0.00"; if (detailCell?.t === "n") detailCell.z = "#,##0.00"; });
      for (const [sheet, c] of [[summary, 11], [detail, 43]]) { const cell = sheet[XLSX.utils.encode_cell({ r, c })]; if (cell?.t === "n") cell.z = "#,##0.00"; }
    }
    const workbook = XLSX.utils.book_new();
    workbook.Props = { Title: `Annual accounting ${snapshot.year}`, Author: "LMATS Consulting", Subject: "Annual accounting summary and monthly controls" };
    XLSX.utils.book_append_sheet(workbook, summary, "Summary");
    XLSX.utils.book_append_sheet(workbook, detail, "Monthly Controls");
    return workbook;
  }
  $("export-button").addEventListener("click", async () => {
    if (!finishEdit(true)) return;
    const button = $("export-button"), original = button.innerHTML;
    const snapshot = { year: state.year, rows: clone(yearRows()), customColumns: clone(state.customColumns) };
    button.disabled = true; button.textContent = "Exporting...";
    try {
      const XLSX = await loadExcelLibrary();
      const workbook = buildExportWorkbook(XLSX, snapshot);
      XLSX.writeFile(workbook, `annual-${taxMode ? "tax" : "accounting"}-summary-${snapshot.year}.xlsx`, { bookType: "xlsx", compression: true, cellDates: true });
      notify(`Exported ${snapshot.rows.length} annual rows for ${snapshot.year}: Summary and ${taxMode ? "SPT Details" : "Monthly Controls"}, including Complete and Incomplete work.`);
    } catch (error) { notify(error instanceof Error ? error.message : "Excel export failed. Please retry."); }
    finally { button.disabled = false; button.innerHTML = original; }
  });
  $("reset-demo").addEventListener("click", () => { if (liveMode) { if (!liveBusy && finishEdit(true)) loadLive(true); return; } finishEdit(false); state.rows = seed(); state.customColumns = []; state.history = []; state.future = []; state.year = 2025; state.status = "incomplete"; state.pic = ""; state.taxPic = ""; state.search = ""; state.sort = { field: "clientName", type: "text", title: taxMode ? "SPT subject" : "Client", direction: "asc" }; state.selection = { r: 0, c: 0 }; state.range = null; $("year-select").value = "2025"; $("pic-filter").value = ""; $("tax-pic-filter").value = ""; $("search").value = ""; render(); $("save-status").textContent = "Demo reset to sample data."; });
  const liveSnapshot = data => JSON.stringify({ actor: data.actor, staff: data.staff, rows: data.rows, columns: data.columns });
  function applyLiveContext(data, checkedAt = Date.now()) {
    lastRefreshAt = checkedAt;
    lastLiveSnapshot = liveSnapshot(data);
    const firstLoad = !liveReady;
    liveRoster = data.staff;
    actors.splice(0, actors.length, data.actor); state.actorId = data.actor.id;
    accPics.splice(0, accPics.length, ...new Set(liveRoster.filter(person => person.team === "Accounting Team").map(person => person.name)));
    taxPics.splice(0, taxPics.length, ...new Set(liveRoster.filter(person => person.team === "Tax Team").map(person => person.name)));
    if (data.clients) master.splice(0, master.length, ...data.clients);
    state.rows = data.rows; state.customColumns = data.columns;
    if (firstLoad && !explicitYear && state.rows.length && !state.rows.some(row => row.year === state.year)) state.year = Math.max(...state.rows.map(row => row.year));
    if (state.year === 0 && !state.rows.some(row => row.year === 0)) state.year = Math.max(new Date().getFullYear() - 1, ...state.rows.map(row => row.year));
    const years = [...new Set([state.year, ...Array.from({ length: 101 }, (_, index) => 2000 + index), ...state.rows.map(row => row.year)])].sort((a, b) => b - a);
    $("year-select").innerHTML = years.map(year => `<option value="${year}" ${year === state.year ? "selected" : ""}>${year || "Year not set"}</option>`).join("");
    for (const [id, names, title] of [["pic-filter", accPics, "All ACC PIC"], ["tax-pic-filter", taxPics, "All Tax PIC"]]) {
      $(id).innerHTML = `<option value="">${title}</option><option value="__unassigned__">Unassigned</option>${names.map(name => `<option>${escape(name)}</option>`).join("")}`;
      $(id).value = id === "pic-filter" ? state.pic : state.taxPic;
    }
    const form = $("outside-form");
    for (const [field, names] of [["accountingPic", accPics], ["taxPic", taxPics]]) form.elements[field].innerHTML = `<option value="">Unassigned</option>${names.map(name => `<option>${escape(name)}</option>`).join("")}`;
    liveReady = true;
  }
  async function saveLive(operation, label) {
    if (liveBusy || !liveReady) return;
    liveEpoch++; deferredRefresh = null; window.AnnualSheetLive.cancelLoad();
    liveBusy = true; render(); $("save-status").textContent = "Saving to database...";
    try { applyLiveContext(await operation()); $("save-status").textContent = `${label}. Saved to database.`; }
    catch (error) {
      try { applyLiveContext(await window.AnnualSheetLive.load()); } catch (refreshError) { if ([401, 403, 409].includes(refreshError.status)) clearLiveAccess(); }
      $("save-status").textContent = `Save not confirmed: ${error.message}`; notify(`Save not confirmed: ${error.message} The sheet shows the last confirmed database data.`);
    } finally { liveBusy = false; render(); }
  }
  function interactingWithSheet() {
    return editor || drag || activeRange || rowMenuId || !$("add-client-menu").hidden || document.querySelector("dialog[open]") || document.activeElement?.matches("input,select,textarea");
  }
  function clearLiveAccess() {
    liveEpoch++; deferredRefresh = null; liveReady = false; window.AnnualSheetLive?.clearAccess();
    finishEdit(false); document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
    state.rows = []; state.customColumns = []; state.actorId = ""; liveRoster = []; actors.splice(0); master.splice(0); render();
    $("sheet-loading").hidden = false; $("sheet-loading").textContent = "Your access or account changed. Reload the dashboard to reconnect.";
  }
  function applyDeferredRefresh() {
    if (!deferredRefresh) return;
    if (deferredRefresh.epoch !== liveEpoch) { deferredRefresh = null; return; }
    if (liveBusy || interactingWithSheet()) return;
    const { data, checkedAt } = deferredRefresh; deferredRefresh = null; applyLiveContext(data, checkedAt); render();
    $("save-status").textContent = "Connected. Latest database changes loaded.";
    if (Date.now() - checkedAt >= 30000) loadLive();
  }
  function loadLive(force = false) {
    if (liveBusy) return Promise.resolve();
    if (refreshPromise) return refreshPromise;
    if (liveReady && !force && Date.now() - lastRefreshAt < 30000) return Promise.resolve();
    lastRefreshAt = Date.now();
    const epoch = liveEpoch, initial = !liveReady;
    const overlay = $("sheet-loading"); overlay.hidden = liveReady;
    const pending = Promise.resolve().then(async () => {
      try {
        if (!window.AnnualSheetLive) throw new Error("Annual workspace transport could not be loaded. Reload the page.");
        const data = await window.AnnualSheetLive.load();
        if (!data || epoch !== liveEpoch || liveBusy) return;
        if (!initial && liveSnapshot(data) === lastLiveSnapshot) return;
        if (!initial && interactingWithSheet()) { deferredRefresh = { data, epoch, checkedAt: Date.now() }; return; }
        applyLiveContext(data); render(); finishSheetStartup();
        $("save-status").textContent = "Connected. Changes are confirmed by the database before appearing here.";
      } catch (error) {
        if (epoch !== liveEpoch || error.name === "AbortError") return;
        if ([401, 403, 409].includes(error.status)) { clearLiveAccess(); return; }
        if (initial) { overlay.textContent = error.message + " "; const retry = document.createElement("button"); retry.className = "button primary"; retry.textContent = "Retry"; retry.onclick = () => loadLive(true); overlay.append(retry); }
        $("save-status").textContent = `Refresh unavailable: ${error.message}${liveReady ? " Last confirmed data remains available." : ""}`;
      }
    }).finally(() => { if (refreshPromise === pending) refreshPromise = null; });
    refreshPromise = pending; return pending;
  }
  window.addEventListener("resize", () => { if (!editor) render(); });
  window.AnnualSheetDemo = { state, transition, parseValue, canEdit, buildExportWorkbook, accountingPicProgress, accountingControlCoverage, get columns() { return columns; }, get visible() { return visible; } };
  const requestedSort = [...buildColumns("all"), ...buildColumns("summary")].find(col => col.field === pageParams.get("sort") && (col.month === undefined ? !pageParams.has("month") : col.month === Number(pageParams.get("month"))));
  if (requestedSort && ["asc", "desc"].includes(pageParams.get("direction"))) state.sort = { ...requestedSort, direction: pageParams.get("direction") };
  $("year-select").value = String(state.year); $("pic-filter").value = state.pic; $("tax-pic-filter").value = state.taxPic; $("search").value = state.search;
  if (!liveMode && !$("year-select").querySelector(`option[value="${state.year}"]`) && ![...$("year-select").options].some(option => Number(option.value) === state.year)) { const option = document.createElement("option"); option.value = state.year; option.textContent = state.year || "Year not set"; $("year-select").append(option); $("year-select").value = String(state.year); }
  $("fullscreen-team-tabs").hidden = !fullScreenMode;
  $("fullscreen-button").hidden = fullScreenMode;
  // CSS is non-blocking so the initial loader can paint while assets and data arrive.
  function finishSheetStartup() {
    if (liveMode && !liveReady) return;
    if ($("sheet-styles").dataset.ready !== "true") return;
    document.documentElement.classList.remove("sheet-booting");
    $("sheet-loading").hidden = true;
    $("sheet-loading").setAttribute("aria-busy", "false");
  }
  function sheetStylesFailed() {
    $("sheet-loading").hidden = false;
    $("sheet-loading").textContent = "Workspace styles could not be loaded. Reload the page to retry.";
  }
  window.addEventListener("sheet-styles-ready", finishSheetStartup);
  window.addEventListener("sheet-styles-error", sheetStylesFailed);
  render();
  if ($("sheet-styles").dataset.failed === "true") sheetStylesFailed();
  else finishSheetStartup();
  if (liveMode) {
    document.documentElement.classList.add("sheet-live");
    $("reset-demo").textContent = "Refresh";
    document.querySelector(".demo-label").hidden = true;
    document.querySelector(".access-toolbar").hidden = true;
    document.querySelectorAll("#help-panel small").forEach(node => { node.textContent = node.textContent.replace(/Demo only; no database changes\.|Demo changes last until you reload this page\./g, "Changes are saved securely to the shared annual workspace."); });
    const refresh = document.createElement("button"); refresh.className = "text-button"; refresh.textContent = "Refresh"; refresh.addEventListener("click", () => { if (!editor && !liveBusy) loadLive(true); });
    document.querySelector(".filter-toolbar .tools").prepend(refresh);
    window.addEventListener("message", event => { if (event.origin === location.origin && event.source === window.parent && event.data?.type === "annual-sheet:refresh" && !editor && !liveBusy) loadLive(); });
    const refreshIfIdle = () => { if (!document.hidden && !editor && !liveBusy) loadLive(); };
    window.addEventListener("focus", refreshIfIdle);
    document.addEventListener("visibilitychange", refreshIfIdle);
    for (const event of ["focusout", "pointerup", "click", "keyup"]) document.addEventListener(event, () => { Promise.resolve().then(applyDeferredRefresh); });
    window.addEventListener("beforeunload", event => { if (liveBusy) { event.preventDefault(); event.returnValue = ""; } });
    loadLive();
  }
})();
