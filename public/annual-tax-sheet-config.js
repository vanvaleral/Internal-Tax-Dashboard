/* Tax-specific model for the shared local spreadsheet preview. */
(() => {
  "use strict";
  if (new URLSearchParams(location.search).get("team") !== "tax") return;
  const controls = [
    { field: "documents", title: "Documents", className: "admin", items: ["Previous SPT", "Lifestyle", "Asset review"] },
    { field: "preparation", title: "Preparation", className: "data", items: ["Confirmation", "Calculation", "Meeting"] },
    { field: "filing", title: "Filing & Payment", className: "preparation", items: ["SPT ready", "Paid", "Filed"] }
  ];
  const stages = ["Data Request", "Preparation", "Confirmation", "Review", "Ready to File", "Payment", "Reported", "Done"];
  let subjectCounter = 20;
  function createRow(person, year, id, staffId) {
    return { id, subjectId: person.subjectId || `demo-subject-${++subjectCounter}`, clientId: person.linkedClientId || "", clientName: person.name, subjectType: person.subjectType || "Individual", groupName: person.groupName || "", recordMethod: person.recordMethod || "Pencatatan", year, outside: !person.groupName, accountingPic: person.accountingPic || "", accountingPicId: staffId(person.accountingPic), taxPic: person.taxPic || "", taxPicId: staffId(person.taxPic, "tax"), assistantIds: [], progress: "Data Request", documents: [], preparation: [], filing: [], payableAmount: "", paymentDate: "", paymentNtpn: "", filingDate: "", ntpe: "", deadline: "", notes: "" };
  }
  function seed(staffId) {
    const people = [
      ["Rin Sagisaka", "Rin Beauty Studio", "Bagus", "Ivan", "Individual"],
      ["Taiyo Shoji", "Nishiki Estate", "Bagus", "Ivan", "Individual"],
      ["Andrew White", "Sajanna Property", "Denny", "", "Individual"],
      ["Kadek Wisu Wardana", "Prabha Rupa Ishana", "Dinar", "Dewayu", "Individual"],
      ["PT Sagara Studio", "Sagara Studio", "Ita", "Cemari", "Corporate"],
      ["Made Arya Pradana", "Bumi Niaga", "Harry", "Dina", "Individual"],
      ["PT Tirta Mandiri", "Tirta Mandiri", "Okta", "Tantri", "Corporate"],
      ["Yuki Tanaka", "", "Bagus", "", "Individual"],
      ["PT Nusantara Distribusi", "Nusantara Distribusi", "Dimas", "Ivan", "Corporate"],
      ["Ni Luh Sari", "", "Ita", "", "Individual"]
    ];
    const rows = people.map(([name, groupName, taxPic, accountingPic, subjectType], index) => {
      const row = createRow({ name, groupName, taxPic, accountingPic, subjectType, subjectId: `demo-subject-${index + 1}` }, 2025, `demo-tax-2025-${index + 1}`, staffId);
      row.progress = stages[Math.min(index % 6, 5)];
      row.documents = Array.from({ length: index < 2 ? 3 : index % 4 }, (_, i) => i);
      row.preparation = Array.from({ length: index < 2 ? 3 : index % 3 }, (_, i) => i);
      row.filing = index < 2 ? [0, 1, 2] : index % 3 === 0 ? [0] : [];
      row.payableAmount = index === 0 ? 0 : index === 1 ? 1906990 : index === 2 ? 99900 : "";
      row.deadline = subjectType === "Corporate" ? "2026-04-20" : "2026-03-20";
      row.notes = ["Prior SPT retained", "Annual filing complete", "Waiting for client confirmation", "Asset review pending", "Corporate financial statements requested", "Confirm personal assets", "Review annual reconciliation", "Independent individual return", "Awaiting supporting schedules", "New subject; collect prior SPT"][index];
      if (index < 2) { row.progress = "Reported"; row.ntpe = `DEMO-BPE-${2025}-${index + 1}`; row.filingDate = "2026-03-10"; if (row.payableAmount > 0) { row.paymentNtpn = "DEMO-NTPN-00002"; row.paymentDate = "2026-03-09"; } }
      if (index === 3) row.assistantIds = [staffId("Bagus", "tax"), staffId("Dewayu")];
      return row;
    });
    rows.slice(0, 4).forEach((source, index) => { const row = JSON.parse(JSON.stringify(source)); row.year = 2024; row.id = `demo-tax-2024-${index + 1}`; row.progress = "Reported"; row.documents = [0, 1, 2]; row.preparation = [0, 1, 2]; row.filing = [0, 1, 2]; row.payableAmount = 0; row.ntpe = `DEMO-BPE-2024-${index + 1}`; row.filingDate = "2025-03-12"; rows.push(row); });
    return rows;
  }
  function completionError(row) {
    if (!row.filing.includes(0) || !row.filing.includes(2) || !row.ntpe.trim() || !row.filingDate) return "Mark SPT ready and Filed, then enter the filing date and NTPE / receipt before marking Reported or Done.";
    if (row.payableAmount === "" || row.payableAmount === null) return "Enter the tax payable amount first. Use 0 for a nil return.";
    if (Number(row.payableAmount) > 0 && (!row.filing.includes(1) || !row.paymentNtpn.trim() || !row.paymentDate)) return "This return has tax payable. Mark Paid and enter the payment date and NTPN before completing it.";
    return "";
  }
  function buildColumns(view, custom, accPics, taxPics) {
    const sections = view === "summary" || view === "all" ? controls : controls.filter(control => control.field === view);
    const col = (field, title, width, type = "text", extra = {}) => ({ field, title, width, type, ...extra });
    return [
      col("clientName", "SPT subject", 220, "text", { frozen: true }),
      col("subjectType", "Type", 104, "select", { options: ["Individual", "Corporate"], section: "Subject & ownership" }),
      col("groupName", "Linked client / group", 180, "text", { section: "Subject & ownership" }),
      col("taxPic", "Tax PIC", 90, "select", { options: ["", ...taxPics], section: "Subject & ownership" }),
      col("accountingPic", "ACC PIC", 90, "select", { options: ["", ...accPics], section: "Subject & ownership" }),
      col("progress", "Progress", 135, "select", { options: stages, section: "Subject & ownership" }),
      ...sections.flatMap(control => view === "summary" ? [col(control.field, control.title, 150, "summary", { group: control })] : control.items.map((title, month) => col(control.field, title, Math.max(75, title.length * 7 + 22), "check", { month, group: control }))),
      col("payableAmount", "Tax payable (Rp)", 135, "number", { section: "Payment & filing" }),
      ...(view === "filing" || view === "all" ? [col("paymentDate", "Payment date", 115, "date"), col("paymentNtpn", "NTPN", 165), col("filingDate", "Filing date", 115, "date"), col("recordMethod", "Method", 120, "select", { options: ["Pencatatan", "Pembukuan"] })] : []),
      col("ntpe", "NTPE / receipt", 180), col("deadline", "Internal deadline", 115, "date"), ...custom, col("notes", "Note / next action", 270)
    ];
  }
  function priorCandidates(state) {
    const latest = new Map();
    state.rows.filter(row => !row.deletedAt && row.year < state.year).forEach(row => { const previous = latest.get(row.subjectId); if (!previous || previous.year < row.year) latest.set(row.subjectId, row); });
    return [...latest.values()].map(row => ({ clientId: row.subjectId, subjectId: row.subjectId, linkedClientId: row.clientId, name: row.clientName, subjectType: row.subjectType, groupName: row.groupName, recordMethod: row.recordMethod, taxPic: row.taxPic, accountingPic: row.accountingPic }));
  }
  function configureUI(document) {
    const byId = id => document.getElementById(id);
    document.title = "Annual Tax Sheet | LMATS Consulting";
    document.documentElement.classList.add("tax-sheet");
    document.querySelector("h1").innerHTML = 'Annual tax<span class="title-dot">.</span>';
    document.querySelector(".metric > span").textContent = "SPT subjects";
    byId("generate-button").title = "Review prior-year SPT subjects before adding them to this year";
    byId("outside-button").title = "Add an external SPT subject to this annual sheet";
    byId("annual-grid").setAttribute("aria-label", "Editable annual tax return control");
    byId("search").placeholder = "Find SPT subject, group, PIC, note...";
    byId("export-button").title = "Export every SPT subject for the selected year, including completed returns and all milestones. Filters do not limit the export.";
    const tabs = document.querySelector(".view-tabs");
    tabs.setAttribute("aria-label", "SPT milestone view");
    tabs.innerHTML = '<button data-view="summary" role="tab">Summary</button><button data-view="documents" role="tab">Documents</button><button data-view="preparation" role="tab">Preparation</button><button data-view="filing" role="tab">Filing &amp; Payment</button><button data-view="all" role="tab">All milestones</button>';
    byId("help-panel").querySelector("small:last-child").textContent = "One row is one SPT subject, not one client. Review prior-year suggestions before adding them to a new year. Reported / Done requires filing evidence; positive tax payable also requires payment evidence. No stage change auto-checks the milestones. Dates use YYYY-MM-DD.";
    byId("generate-dialog").querySelector(".eyebrow").textContent = "ANNUAL TAX";
    byId("generate-dialog").querySelector("h2").innerHTML = 'Review subjects for <span id="generate-year"></span>.';
    byId("generate-dialog").querySelector(".dialog-head p").textContent = "Choose prior-year SPT subjects deliberately. Multiple directors of the same client remain separate. New-year milestones start blank.";
    byId("confirm-generate").textContent = "Add selected subjects";
    byId("empty-generate").textContent = "Review prior-year subjects";
    byId("empty-state").querySelector("p").textContent = "No SPT subjects match this year, status, and filter.";
    document.querySelector(".page-foot > span:last-child").innerHTML = '<kbd>Click</kbd> dropdown <kbd>F2</kbd> edit <kbd>Drag</kbd> fill checks <kbd>?</kbd> shortcuts';
  }
  function buildWorkbook(XLSX, snapshot) {
    const rows = snapshot.rows.filter(row => !row.deletedAt).sort((a, b) => a.clientName.localeCompare(b.clientName));
    const extra = snapshot.customColumns, date = value => value ? new Date(`${value}T00:00:00Z`) : "";
    const done = row => ["Reported", "Done"].includes(row.progress) && !completionError(row);
    const fields = ["SPT subject", "Type", "Linked client / group", "Tax PIC", "ACC PIC", "Completion", "Progress", ...controls.map(control => `${control.title} (checks)`), "Tax payable (Rp)", "Payment date", "NTPN", "Filing date", "NTPE / receipt", "Internal deadline", ...extra.map(col => col.title), "Notes", "Subject ID", "Annual Work ID"];
    const values = row => [row.clientName, row.subjectType, row.groupName, row.taxPic, row.accountingPic, done(row) ? "Complete" : "Incomplete", row.progress, ...controls.map(control => row[control.field].length), row.payableAmount, date(row.paymentDate), row.paymentNtpn, date(row.filingDate), row.ntpe, date(row.deadline), ...extra.map(col => col.type === "date" ? date(row[col.field]) : row[col.field] ?? ""), row.notes, row.subjectId, row.id];
    const milestoneFields = controls.flatMap(control => control.items.map((title, month) => ({ field: control.field, month, title: `${control.title}: ${title}` })));
    const workbook = XLSX.utils.book_new();
    [["Summary", fields, rows.map(values)], ["SPT Details", [...fields, ...milestoneFields.map(col => col.title)], rows.map(row => [...values(row), ...milestoneFields.map(col => row[col.field].includes(col.month) ? "X" : "")])]].forEach(([name, headers, body]) => {
      const sheet = XLSX.utils.aoa_to_sheet([["LMATS Consulting"], [`Annual tax summary - Tax year ${snapshot.year}`], [`All ${rows.length} SPT subjects. Complete and Incomplete included. PIC filters and search are not applied.`], ["X = checked. Each milestone group has 3 checks. Blank tax payable is unknown; 0 is nil."], headers, ...body], { cellDates: true, dateNF: "yyyy-mm-dd" });
      sheet["!cols"] = headers.map((title, index) => ({ wch: index === 0 ? 38 : title === "Notes" ? 60 : Math.max(18, Math.min(46, title.length + 3)) }));
      sheet["!merges"] = [0, 1, 2, 3].map(r => ({ s: { r, c: 0 }, e: { r, c: headers.length - 1 } }));
      sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: 4 + rows.length, c: headers.length - 1 } }) };
      for (let r = 5; r < rows.length + 5; r++) { const cell = sheet[XLSX.utils.encode_cell({ r, c: 10 })]; if (cell?.t === "n") cell.z = "#,##0"; }
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    });
    workbook.Props = { Title: `Annual tax ${snapshot.year}`, Author: "LMATS Consulting" };
    return workbook;
  }
  window.AnnualTaxSheetConfig = { controls, stages, createRow, seed, buildColumns, priorCandidates, completionError, configureUI, buildWorkbook };
})();
