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
  const rows = [{ id: "master-client", client_code: "CL-00001", legal_name: "Original Client", company_form: "PT", status: "Active", tax_pic_name: "Denny", accounting_pic_name: "Ivan", monthly_fee: 1000000 }];
  let release: (() => void) | undefined, mode = "success";
  w.fetch = async (url: string, init: any = {}) => {
    if (url === "/api/clients" && init.method === "POST") {
      const body = JSON.parse(init.body); writes.push(body);
      await new Promise<void>(resolve => { release = resolve; });
      if (mode === "network") throw new Error("Connection interrupted");
      if (mode === "error") return { ok: false, status: 422, json: async () => ({ error: "This client could not be saved" }) };
      if (mode === "unconfirmed") return { ok: true, status: 200, json: async () => ({ data: [] }) };
      Object.assign(rows[0], { legal_name: body.clients[0].name, notes: body.clients[0].notes });
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
