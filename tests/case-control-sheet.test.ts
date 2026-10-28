import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("public/demo.html");
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
const dbCase = (id: string, name: string, tax: string, acc: string, category = "Himbauan") => ({
  id, client_id: "master-1", client_name: name, case_type: category, case_category: category,
  tax_pic_profile_id: tax, accounting_pic_profile_id: acc, tax_pic_name: tax, accounting_pic_name: acc,
  letter_number: id, subject: "Original", updated_at: "v1", due_date: "2026-11-20"
});

async function dashboard(role = "supervisor", savedUi = {}, offline = false, query = "", expectBlocked = false) {
  const warnings: string[] = [], writes: any[] = [], reads: string[] = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", error => warnings.push(error.message));
  vc.on("error", (...items: any[]) => warnings.push(items.map(item => item?.stack || String(item)).join(" ")));
  const dom = new JSDOM(html, { url: (offline ? "file:///C:/preview/demo.html" : "http://localhost/demo.html") + query, runScripts: "outside-only", virtualConsole: vc });
  const w = dom.window as any;
  if (offline) {
    const cache = new Map();
    Object.defineProperty(w, "localStorage", { value: { getItem:(key: string) => cache.get(key) ?? null, setItem:(key: string, value: string) => cache.set(key, value), removeItem:(key: string) => cache.delete(key) } });
    w.history.replaceState = () => {}; w.history.pushState = () => {};
  }
  w.localStorage.setItem(`tax-practice-v2:${offline ? "offline-preview" : "auth-user-1"}`, JSON.stringify({ ui: { currentView: "cases-view", casesTab: "himbauan", ...savedUi } }));
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.Headers = Headers; w.Response = Response; w.structuredClone = structuredClone;
  const rows = [dbCase("saved-a", "Alpha", "tax-a", "acc-a"), dbCase("saved-b", "Beta", "tax-b", "acc-a"), dbCase("saved-c", "Gamma", "tax-a", "acc-b"), dbCase("saved-d", "Delta", "tax-a", "acc-a", "Pemeriksaan")];
  let hold: ((value: any) => void) | undefined;
  let delay = false, fail = false;
  w.fetch = async (url: string, init: any = {}) => {
    if (init.method && init.method !== "GET") {
      const body = JSON.parse(init.body); writes.push(body);
      if (delay) await new Promise(resolve => { hold = resolve; });
      if (fail) return { ok: false, status: 409, json: async () => ({ error: "Case was changed by another user. Reload before editing." }) };
      const previous = rows.find(row => row.id === body.id) || dbCase("saved-new", body.case?.clientName, "tax-a", "acc-a");
      const data = { ...previous, client_name: body.case?.clientName || previous.client_name, subject: body.case?.subject ?? previous.subject, letter_number: body.case?.letterNumber ?? previous.letter_number, updated_at: `v${writes.length + 1}` };
      for (const [field, column] of [["letterDate", "letter_date"], ["receivedDate", "received_date"], ["completionDate", "completion_date"], ["sphpDate", "sph_p_date"]]) {
        if (body.case?.[field] !== undefined) data[column] = body.case[field];
      }
      if (body.action === "assign-pic") data[`${body.picType}_pic_profile_id`] = body.profileId;
      return { ok: true, status: 200, json: async () => ({ data }) };
    }
    reads.push(url);
    const body = url === "/api/profile" ? { user: { id: "auth-user-1" }, profile: { id: "tax-a", role, display_name: "tax-a", team_division: "Tax Team", directory_active: true } }
      : url === "/api/clients" ? { data: [{ id: "master-1", client_code: "CL-00001", legal_name: "Alpha", status: "Active", tax_pic_profile_id: "tax-a", accounting_pic_profile_id: "acc-a", tax_pic_name: "tax-a", accounting_pic_name: "acc-a" }] }
      : url === "/api/cases" ? { data: rows }
      : url.includes("progressFor=") ? { completedTasks: [{ title: "Linked completed task", completedByName: "tax-a" }], progressEntries: [] }
      : url === "/api/staff" ? { staff: ["tax-a", "tax-b", "acc-a", "acc-b"].map(id => ({ id, display_name: id, directory_active: true, team_division: id.startsWith("tax") ? "Tax Team" : "Accounting Team" })) }
      : { data: [], tasks: [], staff: [], announcements: [] };
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
  w.eval(read("public/vendor/purify.min.js")); w.eval(read("public/workspace-sync.js")); w.eval(read("public/annual-sheet-dashboard.js"));
  // Expose closure references in the test source only, never in the served dashboard.
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1].replace("    })().catch(error =>", "    window.__casesTest = { state, renderCases, getRows: () => taxCases, saveCaseSheetCell, loadSharedCases, loadCaseProgress };\n    })().catch(error =>");
  await w.eval(script); await tick();
  const api = w.__casesTest;
  if (!expectBlocked) assert.ok(api, warnings.join("\n") || w.document.body.textContent.slice(-500));
  return { dom, w, api, rows, writes, reads, warnings, delay: () => { delay = true; }, fail: () => { fail = true; }, release: () => { delay = false; hold?.(null); } };
}

const field = (d: any, id: string, name: string) => d.w.document.querySelector(`[data-case-sheet-id="${id}"][data-case-sheet-field="${name}"]`);
const visible = (d: any) => [...d.w.document.querySelectorAll("[data-case-sheet-row]")].map((row: any) => row.dataset.caseSheetRow);

test("case date paste converts day-first dates and saves ISO values in both sheets and layouts", async () => {
  for (const query of ["", "?casesFullscreen=1&account=auth-user-1"]) {
    const d = await dashboard("supervisor", {}, false, query);
    try {
      for (const [tab, id, name, source, expected] of [
        ["himbauan", "saved-a", "letterDate", "05/11/2026", "2026-11-05"],
        ["himbauan", "saved-a", "receivedDate", " 6/11/2026\r\n", "2026-11-06"],
        ["himbauan", "saved-a", "completionDate", "29/02/2028", "2028-02-29"],
        ["pemeriksaan", "saved-d", "letterDate", "2026-12-31", "2026-12-31"],
        ["pemeriksaan", "saved-d", "receivedDate", "04/03/2026", "2026-03-04"],
        ["pemeriksaan", "saved-d", "sphpDate", "31/12/2026", "2026-12-31"]
      ]) {
        d.w.document.querySelector(`[data-cases-tab="${tab}"]`).click();
        const cell = field(d, id, name), before = d.writes.length;
        const event = new d.w.Event("paste", { bubbles:true, cancelable:true });
        Object.defineProperty(event, "clipboardData", { value:{ getData: () => source } });
        cell.dispatchEvent(event);
        assert.equal(event.defaultPrevented, true); assert.equal(cell.value, expected);
        assert.equal(d.writes.length, before);
        cell.dispatchEvent(new d.w.FocusEvent("focusout", { bubbles:true })); await tick();
        assert.equal(d.writes.length, before + 1);
        assert.equal(d.writes.at(-1).case[name], expected);
        assert.equal(field(d, id, name).value, expected);
        assert.equal(d.api.getRows().find((row: any) => row.id === id)[name], expected);
      }
      assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("invalid, multi-cell and locked date pastes never change an existing date or save", async () => {
  const d = await dashboard();
  try {
    const cell = field(d, "saved-a", "letterDate"); cell.value = "2026-10-01";
    for (const source of ["31/02/2026", "29/02/2026", "31/04/2026", "00/11/2026", "01/13/2026", "01/01/0000", "2026-02-30", "not a date", "", "05/11/2026\t06/11/2026", "\t05/11/2026", "05/11/2026\t", "05/11/2026\n06/11/2026"]) {
      const event = new d.w.Event("paste", { bubbles:true, cancelable:true });
      Object.defineProperty(event, "clipboardData", { value:{ getData: () => source } });
      cell.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true); assert.equal(cell.value, "2026-10-01", source);
      assert.match(d.w.document.getElementById("case-sheet-status").textContent, /valid.*date|one cell/);
    }
    for (const lock of ["readOnly", "disabled"]) {
      cell[lock] = true;
      const event = new d.w.Event("paste", { bubbles:true, cancelable:true });
      Object.defineProperty(event, "clipboardData", { value:{ getData: () => "05/11/2026" } });
      cell.dispatchEvent(event); assert.equal(cell.value, "2026-10-01"); cell[lock] = false;
    }
    assert.equal(d.writes.length, 0); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("expanded case details are viewport-sized and remain wrapped after progress refresh in dashboard and full-screen layouts", async () => {
  assert.match(html, /container:case-sheet-viewport \/ inline-size/);
  assert.match(html, /\.case-progress-viewport \{ position:sticky; left:0; width:min\(100%, calc\(100cqw - 1px\)\)/);
  assert.match(html, /@container case-sheet-viewport \(max-width:720px\)/);
  for (const query of ["", "?casesFullscreen=1&account=auth-user-1"]) {
    const d = await dashboard("supervisor", {}, false, query);
    try {
      d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click(); await tick();
      const panel = d.w.document.querySelector(".case-progress-inline td");
      assert.equal(panel.children.length, 1);
      assert.ok(panel.firstElementChild.classList.contains("case-progress-viewport"));
      assert.ok(panel.querySelector("#himbauan-progress-entry"));
      await d.api.loadCaseProgress("saved-a");
      assert.equal(panel.children.length, 1);
      assert.ok(panel.firstElementChild.classList.contains("case-progress-viewport"));
      assert.equal(d.writes.length, 0); assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("Cases Full Screen links open the current category in an account-bound isolated tab", async () => {
  const d = await dashboard();
  try {
    d.w.document.querySelector('[data-cases-tab="pemeriksaan"]').click();
    const link = d.w.document.querySelector("[data-case-fullscreen]");
    const url = new URL(link.href);
    assert.equal(url.origin, "http://localhost"); assert.equal(url.pathname, "/demo.html");
    assert.equal(url.searchParams.get("casesFullscreen"), "1");
    assert.equal(url.searchParams.get("casesTab"), "pemeriksaan");
    assert.equal(url.searchParams.get("account"), "auth-user-1");
    assert.equal(link.target, "_blank"); assert.match(link.rel, /noopener/);
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("standalone Cases keeps saved filters/widths, both categories, refresh URLs and original dashboard navigation", async () => {
  const saved = { currentView:"allocation-view", caseTaxFilter:"tax-a", caseColumnWidths:{ himbauan:{ clientName:320 } }, appearance:{ theme:"dark", accent:"#087f8d" } };
  const d = await dashboard("supervisor", saved, false, "?casesFullscreen=1&casesTab=himbauan&account=auth-user-1");
  try {
    assert.equal(d.api.state.currentView, "cases-view");
    assert.ok(d.w.document.documentElement.classList.contains("cases-fullscreen"));
    assert.equal(d.w.document.querySelector("[data-case-fullscreen]"), null);
    assert.ok(d.w.document.querySelector('a[aria-label="Back to Dashboard"]'));
    assert.deepEqual(visible(d), ["saved-a", "saved-c"]);
    assert.equal(d.w.document.querySelector('[data-case-column="clientName"]').style.width, "320px");
    d.w.document.querySelector('[data-cases-tab="pemeriksaan"]').click();
    assert.equal(new URL(d.w.location.href).searchParams.get("casesTab"), "pemeriksaan");
    assert.equal(new URL(d.w.location.href).searchParams.get("casesFullscreen"), "1");
    assert.equal(new URL(d.w.location.href).searchParams.get("account"), "auth-user-1");
    assert.equal(JSON.parse(d.w.localStorage.getItem("tax-practice-v2:auth-user-1")).ui.currentView, "allocation-view");
    const changedMain = JSON.parse(d.w.localStorage.getItem("tax-practice-v2:auth-user-1"));
    changedMain.ui.currentView = "profile-view";
    d.w.localStorage.setItem("tax-practice-v2:auth-user-1", JSON.stringify(changedMain));
    d.w.document.querySelector("[data-case-sheet-reset]").click();
    assert.equal(JSON.parse(d.w.localStorage.getItem("tax-practice-v2:auth-user-1")).ui.currentView, "profile-view");
    assert.ok(d.reads.includes("/api/cases")); assert.ok(d.reads.includes("/api/staff"));
    assert.ok(d.reads.includes("/api/my-work"));
    assert.equal(d.reads.some(url => url.includes("/api/operations") || url.includes("/api/annual-sheet") || url.includes("/api/announcements") || url.includes("/api/performance")), false);
    assert.equal(d.writes.length, 0); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("full-screen links block pending saves and live drafts rather than showing an older database copy", async () => {
  const d = await dashboard();
  try {
    const subject = field(d, "saved-a", "subject"); subject.value = "Saving now";
    d.delay(); const save = d.api.saveCaseSheetCell(subject); await tick();
    let event = new d.w.MouseEvent("click", { bubbles:true, cancelable:true });
    d.w.document.querySelector("[data-case-fullscreen]").dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.match(d.w.document.getElementById("case-sheet-status").textContent, /save to finish/);
    d.release(); await save;
    d.w.document.querySelector("[data-new-case]").click();
    event = new d.w.MouseEvent("click", { bubbles:true, cancelable:true });
    d.w.document.querySelector("[data-case-fullscreen]").dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.match(d.w.document.getElementById("case-sheet-status").textContent, /new case drafts/);
  } finally { d.dom.window.close(); }
});

test("an account-bound full-screen URL cannot load another signed-in user's workspace", async () => {
  const d = await dashboard("supervisor", {}, false, "?casesFullscreen=1&account=other-user", true);
  try {
    assert.match(d.w.document.body.textContent, /signed-in account changed/);
    assert.deepEqual(d.reads, ["/api/profile"]); assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("column preferences sync between dashboard and full-screen tabs without replacing editors or accepting another account's settings", async () => {
  const d = await dashboard();
  try {
    const subject = field(d, "saved-a", "subject"); subject.focus(); subject.value = "Uncommitted typing";
    const newValue = JSON.stringify({ ui:{ caseColumnWidths:{ himbauan:{ clientName:360 }, pemeriksaan:{ subject:240 } } } });
    d.w.dispatchEvent(new d.w.StorageEvent("storage", { key:"tax-practice-v2:other-account", newValue }));
    assert.equal(d.w.document.querySelector('[data-case-column="clientName"]').style.width, "");
    d.w.dispatchEvent(new d.w.StorageEvent("storage", { key:"tax-practice-v2:auth-user-1", newValue }));
    assert.equal(d.w.document.querySelector('[data-case-column="clientName"]').style.width, "360px");
    assert.equal(field(d, "saved-a", "subject"), subject); assert.equal(subject.value, "Uncommitted typing");
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("demo case expansion shows useful work context and permits demo follow-ups without asking to save or writing to the API", async () => {
  const d = await dashboard("staff", {}, true);
  try {
    d.api.state.currentView = "cases-view"; d.api.state.selectedPic = "Bagus"; d.api.renderCases();
    const toggle = d.w.document.querySelector("[data-toggle-himbauan-progress]");
    const id = toggle.dataset.toggleHimbauanProgress;
    const record = d.api.getRows().find((row: any) => row.id === id);
    record.nextSteps = [{ title:"Collect supporting documents", done:false }];
    d.api.state.myWork = [{ id:"open-task", caseId:id, title:"Prepare explanation memo", done:false }];
    d.api.renderCases(); d.w.document.querySelector(`[data-toggle-himbauan-progress="${id}"]`).click(); await tick();
    const panel = d.w.document.querySelector(".case-progress-inline");
    assert.match(panel.textContent, /Demo preview/);
    assert.doesNotMatch(panel.textContent, /Save this Himbauan first|New case draft/);
    assert.match(panel.textContent, /Collect supporting documents/);
    assert.match(panel.textContent, /Prepare explanation memo/);
    assert.ok(panel.textContent.includes(record.notes));
    const input = d.w.document.getElementById("himbauan-progress-entry");
    assert.equal(input.disabled, false); input.value = "Received partial records; follow up tomorrow";
    panel.querySelector("[data-add-himbauan-progress]").click(); await tick();
    assert.match(d.w.document.querySelector(".case-progress-inline").textContent, /Received partial records/);
    assert.equal(d.writes.length, 0);
    assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("live drafts explain automatic saving, then activate progress after the database creates the case", async () => {
  const d = await dashboard();
  try {
    d.w.document.querySelector("[data-new-case]").click();
    const draft = d.api.getRows().find((row: any) => row.id.startsWith("case-"));
    d.w.document.querySelector(`[data-toggle-himbauan-progress="${draft.id}"]`).click(); await tick();
    assert.match(d.w.document.querySelector(".case-progress-inline").textContent, /leave the cell to save automatically/);
    assert.equal(d.w.document.getElementById("himbauan-progress-entry").disabled, true);
    d.w.document.querySelector("[data-case-focus-client]").click();
    const client = field(d, draft.id, "clientName"); assert.equal(d.w.document.activeElement, client);
    client.value = "Alpha"; await d.api.saveCaseSheetCell(client); await tick();
    assert.equal(draft.id, "saved-new");
    assert.equal(d.w.document.getElementById("himbauan-progress-entry").disabled, false);
    assert.doesNotMatch(d.w.document.querySelector(".case-progress-inline").textContent, /New case draft/);
  } finally { d.dom.window.close(); }
});

test("progress failures offer retry, and loading updates never replaces an edited sheet cell", async () => {
  const d = await dashboard();
  try {
    const originalFetch = d.w.fetch;
    d.w.fetch = async (url: string, init: any) => url.includes("progressFor=") ? { ok:false, json:async () => ({ error:"Progress unavailable" }) } : originalFetch(url, init);
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click(); await tick();
    assert.match(d.w.document.querySelector(".case-progress-inline").textContent, /Progress unavailable/);
    assert.ok(d.w.document.querySelector("[data-case-reload-progress]"));
    const subject = field(d, "saved-a", "subject"); subject.focus(); subject.value = "Still typing";
    d.w.fetch = originalFetch; await d.api.loadCaseProgress("saved-a");
    assert.equal(field(d, "saved-a", "subject"), subject); assert.equal(subject.value, "Still typing");
    assert.match(d.w.document.querySelector(".case-progress-inline").textContent, /Linked completed task/);
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("dragging column borders saves account-scoped widths that survive navigation and reload without database writes", async () => {
  const d = await dashboard();
  let savedUi;
  try {
    const handle = d.w.document.querySelector('[data-case-resize="clientName"]');
    handle.dispatchEvent(new d.w.MouseEvent("pointerdown", { bubbles:true, button:0, clientX:200 }));
    d.w.document.dispatchEvent(new d.w.MouseEvent("pointermove", { bubbles:true, clientX:280 }));
    d.w.document.dispatchEvent(new d.w.MouseEvent("pointerup", { bubbles:true, clientX:280 }));
    assert.equal(d.w.document.querySelector('[data-case-column="clientName"]').style.width, "300px");
    assert.equal(handle.getAttribute("aria-valuenow"), "300");
    savedUi = JSON.parse(d.w.localStorage.getItem("tax-practice-v2:auth-user-1")).ui;
    assert.equal(savedUi.caseColumnWidths.himbauan.clientName, 300);
    d.w.document.querySelector('[data-cases-tab="pemeriksaan"]').click();
    assert.equal(d.w.document.querySelector('[data-case-column="clientName"]').style.width, "");
    d.w.document.querySelector('[data-cases-tab="himbauan"]').click();
    assert.equal(d.w.document.querySelector('[data-case-column="clientName"]').style.width, "300px");
    assert.equal(d.w.document.body.classList.contains("case-column-resizing"), false);
    assert.equal(d.api.state.caseSheetSort.direction, "asc");
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
  const reopened = await dashboard("supervisor", savedUi);
  try {
    assert.equal(reopened.w.document.querySelector('[data-case-column="clientName"]').style.width, "300px");
    assert.deepEqual(reopened.warnings, []);
  } finally { reopened.dom.window.close(); }
});

test("column resizing is keyboard accessible, bounded and individually resettable", async () => {
  const d = await dashboard();
  try {
    const handle = d.w.document.querySelector('[data-case-resize="subject"]');
    handle.dispatchEvent(new d.w.KeyboardEvent("keydown", { key:"ArrowRight", shiftKey:true, bubbles:true }));
    assert.equal(handle.getAttribute("aria-valuenow"), "174");
    for (let i = 0; i < 30; i++) handle.dispatchEvent(new d.w.KeyboardEvent("keydown", { key:"ArrowRight", shiftKey:true, bubbles:true }));
    assert.equal(handle.getAttribute("aria-valuenow"), "640");
    handle.dispatchEvent(new d.w.MouseEvent("dblclick", { bubbles:true }));
    assert.equal(handle.getAttribute("aria-valuenow"), "150");
    for (let i = 0; i < 10; i++) handle.dispatchEvent(new d.w.KeyboardEvent("keydown", { key:"ArrowLeft", shiftKey:true, bubbles:true }));
    assert.equal(handle.getAttribute("aria-valuenow"), "72");
    handle.dispatchEvent(new d.w.KeyboardEvent("keydown", { key:"Home", bubbles:true }));
    assert.equal(handle.getAttribute("aria-valuenow"), "150");
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("cancelled column drags restore original widths without saving changes", async () => {
  const d = await dashboard();
  try {
    const handle = d.w.document.querySelector('[data-case-resize="notes"]');
    handle.dispatchEvent(new d.w.MouseEvent("pointerdown", { bubbles:true, button:0, clientX:200 }));
    d.w.document.dispatchEvent(new d.w.MouseEvent("pointermove", { bubbles:true, clientX:260 }));
    assert.equal(handle.getAttribute("aria-valuenow"), "220");
    d.w.document.dispatchEvent(new d.w.Event("pointercancel", { bubbles:true }));
    assert.equal(handle.getAttribute("aria-valuenow"), "160");
    assert.equal(d.w.document.querySelector('[data-case-column="notes"]').style.width, "");
    assert.equal(d.w.document.body.classList.contains("case-column-resizing"), false);
    assert.equal(d.api.state.caseColumnWidths.himbauan.notes, undefined);
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("case presentation integrates navigation and filters with intentional column sizes and accessible categories", async () => {
  const d = await dashboard();
  try {
    for (const category of ["himbauan", "pemeriksaan"]) {
      d.w.document.querySelector(`[data-cases-tab="${category}"]`).click();
      const panel = d.w.document.querySelector("#cases-view .case-sheet-panel");
      assert.ok(panel.querySelector(".case-sheet-nav"));
      assert.ok(panel.querySelector(".case-search-wrap #case-search"));
      assert.equal(panel.querySelectorAll(".case-filter-pair select").length, 2);
      assert.equal(panel.querySelectorAll("colgroup col").length, 13);
      assert.equal(panel.querySelectorAll('[data-case-column-group="ownership"]').length, category === "himbauan" ? 2 : 3);
      assert.equal(panel.querySelector(`[data-cases-tab="${category}"]`).getAttribute("aria-pressed"), "true");
      assert.match(panel.querySelector(".case-filter-result").textContent, /of.*cases/);
      assert.ok(panel.querySelector(".case-col-clientName"));
      assert.ok(panel.querySelector(".case-col-actions"));
      assert.equal(panel.querySelector("[data-virtual-table]").getAttribute("tabindex"), "0");
    }
    assert.deepEqual(d.warnings, []); assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("Cases retains both original column sets, simultaneous PIC filters, header sorting and Reset", async () => {
  const d = await dashboard();
  try {
    assert.deepEqual(d.warnings, []);
    assert.deepEqual(visible(d), ["saved-a", "saved-b", "saved-c"]);
    for (const [id, value] of [["case-acc-filter", "acc-a"], ["case-tax-filter", "tax-a"]]) {
      const select = d.w.document.getElementById(id); select.value = value; select.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    }
    assert.deepEqual(visible(d), ["saved-a"]);
    d.w.document.querySelector("[data-case-sheet-reset]").click();
    d.w.document.querySelector('[data-case-sheet-sort="clientName"]').click();
    assert.deepEqual(visible(d), ["saved-c", "saved-b", "saved-a"]);
    assert.equal(d.w.document.querySelector('[aria-sort="descending"]').textContent.trim().startsWith("Wajib Pajak"), true);
    d.w.document.querySelector("[data-case-sheet-reset]").click();
    assert.equal(d.api.state.caseSheetSort.direction, "asc");
    assert.deepEqual([...d.w.document.querySelectorAll(".case-sheet th")].map((th: any) => th.textContent.replace(/[↑↓↕]/g, "").trim()), ["No.", "Wajib Pajak", "No Surat", "Tgl Surat", "Tgl Terima", "Perihal", "Jatuh Tempo", "Deadline", "Tgl Selesai", "PIC Tax", "PIC ACC", "Note", "Actions"]);
    d.w.document.querySelector('[data-cases-tab="pemeriksaan"]').click();
    for (const title of ["Tahun Pajak", "PIC Pemeriksa", "Tgl SPHP", "Penyelesaian"]) assert.ok(d.w.document.querySelector(".case-sheet thead").textContent.includes(title));
    assert.deepEqual(visible(d), ["saved-d"]);
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("sheet edits publish only confirmed values, serialize versions, preserve pending rows during refresh and roll back conflicts", async () => {
  const d = await dashboard();
  try {
    const record = d.api.getRows().find((row: any) => row.id === "saved-a");
    const subject = field(d, "saved-a", "subject"); subject.value = "First edit";
    d.delay(); const first = d.api.saveCaseSheetCell(subject); await tick();
    assert.equal(record.subject, "Original"); assert.equal(subject.disabled, true);
    await d.api.loadSharedCases(true);
    assert.equal(d.api.getRows().find((row: any) => row.id === record.id), record);
    const letter = field(d, "saved-a", "letterNumber"); letter.value = "Second edit";
    const second = d.api.saveCaseSheetCell(letter);
    assert.equal(d.writes.length, 1);
    d.release(); await first; await second;
    assert.equal(record.subject, "First edit"); assert.equal(record.letterNumber, "Second edit");
    assert.equal(d.writes[0].version, "v1"); assert.equal(d.writes[1].version, "v2");
    assert.equal(d.writes[1].case.subject, "First edit");
    d.fail(); const currentSubject = field(d, "saved-a", "subject"); currentSubject.value = "Rejected edit"; await d.api.saveCaseSheetCell(currentSubject);
    assert.equal(record.subject, "First edit"); assert.equal(currentSubject.value, "First edit");
    assert.match(d.w.document.getElementById("case-sheet-status").textContent, /Not saved.*another user/);
    assert.equal(d.api.state.syncIssues.length, 0, "rolled-back edits must not appear as local pending changes");
  } finally { d.dom.window.close(); }
});

test("spreadsheet navigation and progress do not open extra editors; staff cannot reassign PIC", async () => {
  const d = await dashboard("staff");
  try {
    assert.deepEqual(visible(d), ["saved-a", "saved-c"]);
    assert.equal(d.w.document.querySelector('select[data-case-sheet-field$="PicProfileId"]'), null);
    const cell = field(d, "saved-a", "subject"); cell.focus();
    cell.dispatchEvent(new d.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assert.equal(d.w.document.activeElement, field(d, "saved-c", "subject"));
    const next = field(d, "saved-c", "subject"); next.value = "Uncommitted";
    next.dispatchEvent(new d.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(next.value, "Original");
    next.click(); assert.equal(d.w.document.querySelector(".case-progress-inline"), null);
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click(); await tick();
    assert.match(d.w.document.querySelector(".case-progress-inline").textContent, /Linked completed task/);
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("new cases require a valid Client Master link, retain draft fields, and receive database identity", async () => {
  const d = await dashboard();
  try {
    d.w.document.querySelector("[data-new-case]").click();
    const draft = d.api.getRows().find((row: any) => row.id.startsWith("case-"));
    const subject = field(d, draft.id, "subject"); subject.value = "Draft subject"; d.api.saveCaseSheetCell(subject);
    const client = field(d, draft.id, "clientName"); client.value = "Unknown company"; await d.api.saveCaseSheetCell(client);
    assert.equal(d.writes.length, 0); assert.equal(draft.clientName, "");
    assert.equal(client.value, "");
    client.value = "Alpha"; await d.api.saveCaseSheetCell(client);
    assert.equal(draft.id, "saved-new"); assert.equal(d.writes[0].case.clientId, "master-1");
    assert.equal(d.writes[0].case.subject, "Draft subject"); assert.equal(client.readOnly, true);
    assert.ok(field(d, "saved-new", "subject"));
  } finally { d.dom.window.close(); }
});

test("edits made during new-case creation queue behind the POST without losing draft values", async () => {
  const d = await dashboard();
  try {
    d.w.document.querySelector("[data-new-case]").click();
    const draft = d.api.getRows().find((row: any) => row.id.startsWith("case-"));
    const client = field(d, draft.id, "clientName"); client.value = "Alpha";
    d.delay(); const create = d.api.saveCaseSheetCell(client); await tick();
    const subject = field(d, draft.id, "subject"); subject.value = "Typed while creating";
    const edit = d.api.saveCaseSheetCell(subject);
    d.release(); await create; await edit;
    assert.equal(d.writes.length, 2);
    assert.equal(d.writes[1].id, "saved-new"); assert.equal(d.writes[1].version, "v2");
    assert.equal(draft.subject, "Typed while creating");
    assert.equal(field(d, "saved-new", "subject").value, "Typed while creating");
    assert.equal(d.w.document.querySelector('[data-case-sheet-row="saved-new"] select[aria-label="Tax Team case PIC"]') !== null, true);
  } finally { d.dom.window.close(); }
});

test("search applies short text, combines with filters and reset; range paste never corrupts a cell", async () => {
  const d = await dashboard();
  try {
    const search = d.w.document.getElementById("case-search"); search.value = "Be";
    search.dispatchEvent(new d.w.Event("input", { bubbles: true }));
    assert.deepEqual(visible(d), ["saved-b"]);
    d.w.document.querySelector("[data-case-sheet-reset]").click();
    const cell = field(d, "saved-a", "subject");
    const paste = new d.w.Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { getData: () => "Alpha\tBeta\nGamma" } });
    cell.dispatchEvent(paste);
    assert.equal(paste.defaultPrevented, true); assert.equal(cell.value, "Original");
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("historical PIC names without profile IDs do not become visually unassigned after editing another cell", async () => {
  const d = await dashboard();
  try {
    d.rows[0].tax_pic_profile_id = ""; d.rows[0].tax_pic_name = "Former Tax PIC";
    await d.api.loadSharedCases(true);
    const pic = field(d, "saved-a", "taxPicProfileId");
    assert.equal(pic.value, "legacy"); assert.equal(pic.selectedOptions[0].textContent, "Former Tax PIC");
    const subject = field(d, "saved-a", "subject"); subject.value = "Updated subject";
    await d.api.saveCaseSheetCell(subject);
    assert.equal(pic.value, "legacy"); assert.equal(pic.selectedOptions[0].textContent, "Former Tax PIC");
    assert.equal(d.writes[0].case.taxPic, "Former Tax PIC");
  } finally { d.dom.window.close(); }
});
