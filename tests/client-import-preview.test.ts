import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };

async function fixture(invalid = false, similar = false) {
  const warnings: string[] = [], writes: any[] = [], alerts: string[] = [];
  const vc = new VirtualConsole(); vc.on("jsdomError", error => warnings.push(error.message));
  const dom = new JSDOM(read("public/demo.html"), { url: "http://localhost/demo.html", runScripts: "outside-only", virtualConsole: vc });
  const w = dom.window as any;
  w.localStorage.setItem("tax-practice-v2:import-user", JSON.stringify({ ui: { currentView: "client-management-view" } }));
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.Headers = Headers; w.Response = Response; w.structuredClone = structuredClone; w.alert = (text: string) => alerts.push(text);
  const rows = [{ name: "Example Client", monthlyFee: "2500000" }];
  const matches = [{ row: 2, clientCode: "CL-00001", clientId: "master", updatedAt: "2026-11-01", action: "update", matchedBy: "name", errors: invalid ? ["Client name is ambiguous <unsafe>"] : [] }];
  const candidates = [{ clientId: "master", clientCode: "CL-00001", name: "Example Client <safe>", businessForm: "PT", status: "Inactive", engagementType: "on_demand", similarity: 92, conflicts: [] }, { clientId: "conflict", clientCode: "CL-OTHER", name: "Example Client II", businessForm: "CV", status: "Active", engagementType: "contract", similarity: 88, conflicts: ["Different company form <unsafe>"] }];
  let release: (() => void) | undefined, fail = false;
  w.fetch = async (url: string, init: any = {}) => {
    if (url === "/api/clients/parse-import") return { ok: true, json: async () => ({ rows }) };
    if (url === "/api/clients" && init.method === "POST") {
      const body = JSON.parse(init.body); writes.push(body);
      if (body.operation === "validate-import") {
        const choice = body.nameChoices?.[2] || "";
        const updating = !similar || choice === "master";
        return { ok: true, json: async () => ({ matches: updating ? matches : [{ ...matches[0], action: "create", matchedBy: null, clientCode: "NEW", clientId: null }], similarNames: similar ? [{ row: 2, candidates, choice }] : [], validation: [{ row: 2, errors: matches[0].errors }], summary: { total: 1, updated: invalid || !updating ? 0 : 1, created: similar && !updating ? 1 : 0, invalid: invalid ? 1 : 0, reviewRequired: similar && !choice ? 1 : 0 } }) };
      }
      await new Promise<void>(resolve => { release = resolve; });
      return { ok: !fail, status: fail ? 409 : 200, json: async () => fail ? { error: "Client records changed since preview. Upload again." } : { data: [{ id: "master", client_code: "CL-00001" }], updated: 1, created: 0 } };
    }
    const body = url === "/api/profile" ? { user: { id: "import-user" }, profile: { id: "supervisor", role: "supervisor", display_name: "Supervisor", directory_active: true } }
      : url === "/api/clients" ? { data: [{ id: "master", client_code: "CL-00001", legal_name: "Example Client", status: "Active" }] }
      : { data: [], tasks: [], staff: [], announcements: [] };
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
  for (const file of ["public/vendor/purify.min.js", "public/workspace-sync.js", "public/feature-access.js", "public/client-engagement.js", "public/annual-sheet-dashboard.js"]) w.eval(read(file));
  await w.eval(read("public/demo.html").match(/<script>([\s\S]*?)<\/script>/)![1]); await tick();
  const input = w.document.getElementById("client-csv-input");
  Object.defineProperty(input, "files", { value: [new w.File(["synthetic"], "clients.xlsx")] });
  input.dispatchEvent(new w.Event("change", { bubbles: true })); await tick();
  return { dom, w, writes, alerts, warnings, rows, matches, release: () => release?.(), fail: () => { fail = true; }, modal: () => w.document.querySelector('[aria-label="Client import preview"]') };
}

test("import preview shows the matched code and preserves raw partial rows through confirmation", async () => {
  const d = await fixture();
  try {
    assert.match(d.modal().textContent, /Update CL-00001 \(by name\)/);
    assert.deepEqual(d.writes[0].clients, d.rows, "display defaults must not enter validation payload");
    d.modal().querySelector("[data-confirm-client-import]").click(); await tick();
    assert.equal(d.writes.length, 2); assert.deepEqual(d.writes[1].clients, d.rows);
    assert.deepEqual(d.writes[1].expectedMatches, d.matches);
    assert.match(d.modal().textContent, /Importing/);
    const close = d.modal().querySelector("[data-close-import-preview]"); assert.equal(close.disabled, true);
    close.dispatchEvent(new d.w.MouseEvent("click", { bubbles: true }));
    d.modal().querySelector("[data-confirm-client-import]").dispatchEvent(new d.w.MouseEvent("click", { bubbles: true }));
    assert.equal(d.writes.length, 2); assert.ok(d.modal());
    d.release(); await tick(); await tick();
    assert.equal(d.modal(), null); assert.match(d.alerts[0], /0 new, 1 updated/); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("ambiguous preview escapes errors and disables import", async () => {
  const d = await fixture(true);
  try {
    assert.equal(d.modal().querySelector("[data-confirm-client-import]").disabled, true);
    assert.match(d.modal().textContent, /Client name is ambiguous <unsafe>/);
    assert.equal(d.modal().querySelector("unsafe"), null);
    assert.equal(d.writes.length, 1); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("stale preview errors keep the file preview open with a visible explanation", async () => {
  const d = await fixture();
  try {
    d.fail(); d.modal().querySelector("[data-confirm-client-import]").click(); await tick();
    d.release(); await tick();
    assert.match(d.modal().querySelector('[role="alert"]').textContent, /changed since preview/);
    assert.equal(d.modal().querySelector("[data-close-import-preview]").disabled, false);
    assert.equal(d.writes.length, 2); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("similar names require a deliberate choice and a separate server review before import", async () => {
  const d = await fixture(false, true);
  try {
    const button = () => d.modal().querySelector("[data-confirm-client-import]");
    assert.equal(button().disabled, true);
    const select = d.modal().querySelector('[data-import-name-choice="2"]');
    assert.equal(select.value, "", "no candidate may be preselected");
    assert.match(select.textContent, /CL-00001.*92% similar.*Inactive/);
    assert.equal(select.querySelector('option[value="conflict"]').disabled, true);
    assert.equal(d.modal().querySelector("unsafe"), null);
    select.value = "master"; select.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.equal(button().textContent, "Review selected matches");
    assert.match(d.modal().textContent, /On Demand/);
    button().click(); await tick();
    assert.equal(d.writes.length, 2); assert.equal(d.writes[1].operation, "validate-import");
    assert.deepEqual(d.writes[1].nameChoices, { 2: "master" });
    assert.equal(button().textContent, "Confirm Import"); assert.equal(button().disabled, false);
    assert.match(d.modal().textContent, /Update CL-00001/);
    assert.deepEqual(d.writes[1].clients, d.rows);
    button().click(); await tick();
    assert.equal(d.writes[2].operation, "bulk-import"); assert.deepEqual(d.writes[2].nameChoices, { 2: "master" });
    assert.equal(d.modal().querySelector('[data-import-name-choice="2"]').disabled, true);
    d.release(); await tick(); await tick();
    assert.equal(d.modal(), null); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("explicitly creating a separate client also requires rechecking the preview", async () => {
  const d = await fixture(false, true);
  try {
    const select = d.modal().querySelector('[data-import-name-choice="2"]');
    select.value = "new"; select.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    d.modal().querySelector("[data-confirm-client-import]").click(); await tick();
    assert.equal(d.writes[1].operation, "validate-import");
    assert.equal(d.writes[1].nameChoices[2], "new");
    assert.equal(d.modal().querySelector("[data-confirm-client-import]").disabled, false);
    assert.match(d.modal().textContent, /Create new/);
    assert.equal(d.writes.filter(write => write.operation === "bulk-import").length, 0);
  } finally { d.dom.window.close(); }
});
