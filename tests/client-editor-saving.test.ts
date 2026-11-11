import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };

async function fixture(mobile = false) {
  const warnings: string[] = [], writes: any[] = [], alerts: string[] = [];
  const vc = new VirtualConsole(); vc.on("jsdomError", error => warnings.push(error.message));
  const dom = new JSDOM(read("public/demo.html"), { url: "http://localhost/demo.html", runScripts: "outside-only", virtualConsole: vc });
  const w = dom.window as any;
  w.localStorage.setItem("tax-practice-v2:editor-user", JSON.stringify({ ui: { currentView: "client-management-view" } }));
  w.matchMedia = (query: string) => ({ matches: mobile && /max-width: (760|900)px/.test(query), addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.Headers = Headers; w.Response = Response; w.structuredClone = structuredClone; w.alert = (text: string) => alerts.push(text);
  const rows = [{ id: "master-client", client_code: "CL-00001", legal_name: "Original Client", company_form: "PT", status: "Active", tax_pic_name: "Denny", accounting_pic_name: "Ivan", monthly_fee: 1000000, contract_started_at: "2024-12-05", engagement_start: "2024-12-05", engagement_end: "2027-06-30" }];
  let release: (() => void) | undefined, mode = "success";
  w.fetch = async (url: string, init: any = {}) => {
    if (url === "/api/clients" && init.method === "POST") {
      const body = JSON.parse(init.body); writes.push(body);
      await new Promise<void>(resolve => { release = resolve; });
      if (mode === "network") throw new Error("Connection interrupted");
      if (mode === "error") return { ok: false, status: 422, json: async () => ({ error: "This client could not be saved" }) };
      if (mode === "unconfirmed") return { ok: true, status: 200, json: async () => ({ data: [] }) };
      Object.assign(rows[0], { legal_name: body.clients[0].name, notes: body.clients[0].notes, contract_started_at: body.clients[0].contractStartedAt, engagement_start: body.clients[0].engagementStart, engagement_end: body.clients[0].engagementEnd });
      return { ok: true, status: 200, json: async () => ({ data: structuredClone(rows) }) };
    }
    const body = url === "/api/profile" ? { user: { id: "editor-user" }, profile: { id: "supervisor", role: "supervisor", display_name: "Supervisor", directory_active: true } }
      : url === "/api/clients" ? { data: rows }
      : url === "/api/staff" ? { staff: [
        { id: "tax", full_name: "Denny", display_name: "Denny", role: "staff", directory_active: true, team_division: "Tax Team" },
        { id: "acc", full_name: "Ivan", display_name: "Ivan", role: "staff", directory_active: true, team_division: "Accounting Team" }
      ] } : { data: [], tasks: [], staff: [], announcements: [] };
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
  for (const file of ["public/vendor/purify.min.js", "public/workspace-sync.js", "public/feature-access.js", "public/client-engagement.js", "public/annual-sheet-dashboard.js"]) w.eval(read(file));
  await w.eval(read("public/demo.html").match(/<script>([\s\S]*?)<\/script>/)![1]); await tick();
  const doc = w.document;
  doc.querySelector(mobile ? ".client-mobile-card [data-edit-client]" : ".client-table [data-edit-client]").click();
  return { dom, w, doc, rows, writes, alerts, warnings, release: () => release?.(), mode: (value: string) => { mode = value; }, modal: () => doc.querySelector("#client-editor-root [data-client-editor-id]") };
}

test("client popup shows a pending save, prevents duplicate/close actions, and keeps a confirmed success visible on desktop and mobile", async () => {
  for (const mobile of [false, true]) {
    const d = await fixture(mobile);
    try {
      const modal = d.modal(), name = modal.querySelector("#client-form-name"), save = modal.querySelector("[data-save-client]"), close = modal.querySelector("[data-close-client-editor]");
      name.value = "Edited Client"; name.dispatchEvent(new d.w.Event("input", { bubbles: true }));
      save.click(); await tick();
      assert.equal(d.writes.length, 1); assert.equal(d.modal(), modal); assert.equal(modal.getAttribute("aria-busy"), "true");
      assert.equal(save.textContent, "Saving..."); assert.equal(save.disabled, true); assert.equal(close.disabled, true); assert.equal(name.disabled, true);
      assert.match(modal.querySelector("[data-client-editor-save-status]").textContent, /Saving to database/);
      assert.equal(d.rows[0].legal_name, "Original Client", "drafts do not become confirmed data before save");
      assert.match(d.doc.querySelector(".client-table .client-link").textContent, /Original Client/);
      save.dispatchEvent(new d.w.MouseEvent("click", { bubbles: true })); close.dispatchEvent(new d.w.MouseEvent("click", { bubbles: true }));
      assert.equal(d.writes.length, 1); assert.equal(d.modal(), modal);
      d.release(); await tick(); await tick();
      assert.equal(d.modal(), modal); assert.equal(modal.getAttribute("aria-busy"), "false");
      assert.equal(name.disabled, false); assert.equal(save.disabled, false);
      assert.equal(modal.querySelector("[data-client-editor-save-status]").textContent, "Saved to database.");
      assert.equal(modal.querySelector(".client-editor-actions [data-close-client-editor]").textContent, "Done");
      name.value = "Another draft"; name.dispatchEvent(new d.w.Event("input", { bubbles: true }));
      assert.equal(modal.querySelector("[data-client-editor-save-status]").textContent, "", "editing clears an obsolete success message");
      modal.querySelector("[data-close-client-editor]").click(); assert.equal(d.modal(), null);
      assert.deepEqual(d.alerts, []); assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("failed client saves retain draft fields without changing the confirmed list and allow an explicit retry", async () => {
  const d = await fixture();
  try {
    d.mode("error"); const modal = d.modal(), name = modal.querySelector("#client-form-name"), note = modal.querySelector("#client-form-notes");
    name.value = "Retain this name"; note.value = "Do not lose these details";
    modal.querySelector("[data-save-client]").click(); await tick(); d.release(); await tick();
    assert.equal(d.modal(), modal); assert.equal(name.value, "Retain this name"); assert.equal(note.value, "Do not lose these details");
    assert.equal(d.rows[0].legal_name, "Original Client"); assert.equal(name.disabled, false);
    const status = modal.querySelector("[data-client-editor-save-status]"); assert.equal(status.getAttribute("role"), "alert"); assert.match(status.textContent, /Save failed.*still in this form/);
    // A background view render must not discard the failed form or its draft text.
    d.doc.getElementById("client-order").dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.equal(d.modal(), modal); assert.equal(name.value, "Retain this name"); assert.equal(note.value, "Do not lose these details");
    d.mode("success"); modal.querySelector("[data-save-client]").click(); await tick(); d.release(); await tick(); await tick();
    assert.equal(d.writes.length, 2); assert.equal(d.writes[1].clients[0].notes, "Do not lose these details");
    assert.equal(status.textContent, "Saved to database."); assert.deepEqual(d.alerts, []);
  } finally { d.dom.window.close(); }
});

test("missing database confirmation and network errors cannot dismiss the popup or claim success", async () => {
  for (const mode of ["unconfirmed", "network"]) {
    const d = await fixture();
    try {
      d.mode(mode); const modal = d.modal(); modal.querySelector("[data-save-client]").click(); await tick(); d.release(); await tick();
      assert.equal(d.modal(), modal); assert.match(modal.querySelector("[data-client-editor-save-status]").textContent, /Save failed/);
      assert.doesNotMatch(modal.querySelector("[data-client-editor-save-status]").textContent, /Saved to database/);
      assert.equal(modal.querySelector("[data-save-client]").disabled, false); assert.equal(d.rows[0].legal_name, "Original Client");
    } finally { d.dom.window.close(); }
  }
});

test("contract dates stay day-first through editing, ISO database save, list display and reopening on desktop and mobile", async () => {
  for (const mobile of [false, true]) {
    const d = await fixture(mobile);
    try {
      const modal = d.modal(), start = modal.querySelector("#client-form-start-date"), end = modal.querySelector("#client-form-end-date");
      assert.equal(start.type, "text"); assert.equal(start.placeholder, "dd/mm/yyyy"); assert.equal(start.value, "05/12/2024"); assert.equal(end.value, "30/06/2027");
      assert.equal(d.rows[0].contract_started_at, "2024-12-05", "opening must not rewrite an existing date");
      start.value = "03/04/2026"; end.value = "18/09/2027";
      modal.querySelector("[data-save-client]").click(); await tick();
      assert.equal(d.writes[0].clients[0].contractStartedAt, "2026-04-03", "03/04 always means 3 April, never March 4");
      assert.equal(d.writes[0].clients[0].engagementStart, "2026-04-03"); assert.equal(d.writes[0].clients[0].engagementEnd, "2027-09-18");
      assert.equal(d.rows[0].contract_started_at, "2024-12-05");
      d.release(); await tick(); await tick();
      assert.equal(d.rows[0].contract_started_at, "2026-04-03");
      assert.match(d.doc.querySelector(".client-contract-date").textContent, /03\/04\/2026/);
      modal.querySelector("[data-close-client-editor]").click();
      d.doc.querySelector(mobile ? ".client-mobile-card [data-edit-client]" : ".client-table [data-edit-client]").click();
      assert.equal(d.modal().querySelector("#client-form-start-date").value, "03/04/2026");
      assert.equal(d.modal().querySelector("#client-form-end-date").value, "18/09/2027");
      assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("client calendar selection targets the open modal, not the legacy duplicate-ID form", async () => {
  const d = await fixture();
  try {
    const modal = d.modal(), start = modal.querySelector("#client-form-start-date"), wrap = start.closest(".client-date-field"), picker = wrap.querySelector("[data-client-date-picker]");
    const legacy = d.doc.querySelector('#client-management-view [id="client-form-start-date"]');
    legacy.value = "01/01/1999";
    let opened = ""; picker.showPicker = () => { opened = picker.value; };
    wrap.querySelector("[data-open-client-date]").click(); assert.equal(opened, "2024-12-05");
    picker.value = "2026-11-23"; picker.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.equal(start.value, "23/11/2026"); assert.equal(legacy.value, "01/01/1999");
    start.value = "2026-08-04"; start.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.equal(start.value, "04/08/2026"); assert.equal(picker.value, "2026-08-04");
    start.value = "15092026"; start.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.equal(start.value, "15/09/2026"); assert.equal(picker.value, "2026-09-15", "numeric mobile keyboards can enter compact day-first dates");
    assert.equal(d.writes.length, 0, "choosing a date alone must not autosave the master");
  } finally { d.dom.window.close(); }
});

test("invalid or month-first contract dates block saving without erasing drafts; real leap dates and cleared dates remain supported", async () => {
  const d = await fixture();
  try {
    const modal = d.modal(), start = modal.querySelector("#client-form-start-date"), end = modal.querySelector("#client-form-end-date");
    for (const value of ["31/02/2026", "29/02/2026", "04/31/2026", "2026-13-01", "not a date"]) {
      start.value = value; start.dispatchEvent(new d.w.Event("input", { bubbles: true }));
      modal.querySelector("[data-save-client]").click(); await tick();
      assert.equal(d.writes.length, 0); assert.equal(start.value, value); assert.equal(start.getAttribute("aria-invalid"), "true");
      assert.match(modal.querySelector("[data-client-editor-save-status]").textContent, /dd\/mm\/yyyy/);
      assert.equal(d.rows[0].contract_started_at, "2024-12-05");
    }
    start.value = "29/02/2024"; start.dispatchEvent(new d.w.Event("input", { bubbles: true }));
    modal.querySelector("[data-save-client]").click(); await tick(); assert.equal(d.writes[0].clients[0].contractStartedAt, "2024-02-29");
    d.release(); await tick(); await tick();
    start.value = ""; end.value = ""; modal.querySelector("[data-save-client]").click(); await tick();
    assert.equal(d.writes[1].clients[0].contractStartedAt, ""); assert.equal(d.writes[1].clients[0].engagementEnd, "");
    d.release(); await tick(); await tick(); assert.match(d.doc.querySelector(".client-contract-date").textContent, /Not recorded/);
  } finally { d.dom.window.close(); }
});
