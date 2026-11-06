import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };

async function clients(mobile = false, ui: Record<string, any> = {}) {
  const warnings: string[] = [], writes: string[] = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", error => warnings.push(error.message));
  for (const kind of ["warn", "error"] as const) vc.on(kind, (...items: any[]) => warnings.push(items.join(" ")));
  const dom = new JSDOM(read("public/demo.html"), { url: "http://localhost/demo.html", runScripts: "outside-only", virtualConsole: vc });
  const w = dom.window as any;
  w.localStorage.setItem("tax-practice-v2:user-1", JSON.stringify({ ui: { currentView: "client-management-view", ...ui } }));
  w.matchMedia = (query: string) => ({ matches: mobile && /max-width: (760|900)px/.test(query), addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.Headers = Headers; w.Response = Response; w.structuredClone = structuredClone;
  w.confirm = () => true;
  const rows = [
    { id: "a", client_code: "CL-00001", legal_name: "Newer", contract_started_at: "2024-06-01", engagement_start: "2010-01-01", tax_pic_name: "Denny" },
    { id: "b", client_code: "CL-00002", legal_name: "Oldest", contract_started_at: "2018-01-01", tax_pic_name: "Budi" },
    { id: "c", client_code: "CL-00003", legal_name: "Legacy", engagement_start: "2020-01-01", tax_pic_name: "Denny" },
    { id: "d", client_code: "CL-00004", legal_name: "Unknown", tax_pic_name: "Budi" },
    { id: "e", client_code: "CL-00005", legal_name: "Archived", status: "Inactive", contract_started_at: "2010-01-01", tax_pic_name: "Budi" },
    { id: "f", client_code: "CL-00006", legal_name: "Future", contract_started_at: "2030-01-01", tax_pic_name: "Budi" },
    { id: "g", client_code: "CL-00007", legal_name: "Annual Only", engagement_type: "on_demand", tax_pic_name: "Denny" }
  ].map(row => ({ status: "Active", company_form: "PT", ...row }));
  const staff = ["Denny", "Budi"].map(name => ({ id: name, display_name: name, full_name: name, role: "staff", team_division: "Tax Team", directory_active: true }));
  w.fetch = async (url: string, init: any = {}) => {
    if (init.method && init.method !== "GET") writes.push(`${init.method} ${url}`);
    if (url === "/api/clients/engagement") return { ok: true, status: 200, json: async () => ({ updated: JSON.parse(init.body).clients.length }) };
    const body = url === "/api/profile" ? { user: { id: "user-1" }, profile: { id: "supervisor", role: "supervisor", display_name: "Supervisor", directory_active: true } }
      : url === "/api/clients" ? { data: rows } : url === "/api/staff" ? { staff } : { data: [], staff: [], tasks: [], announcements: [] };
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
  for (const file of ["public/vendor/purify.min.js", "public/workspace-sync.js", "public/feature-access.js", "public/client-engagement.js", "public/annual-sheet-dashboard.js"]) w.eval(read(file));
  await w.eval(read("public/demo.html").match(/<script>([\s\S]*?)<\/script>/)![1]); await tick();
  const choose = (id: string, value: string) => { const input = w.document.getElementById(id); assert.ok(input); input.value = value; input.dispatchEvent(new w.Event("change", { bubbles: true })); };
  const order = () => Array.from(w.document.querySelectorAll(mobile ? "#client-management-view .client-mobile-name .client-link" : '#client-management-view tr[data-keyboard-row="client"] .client-link'), (element: any) => element.textContent.replace(/^\d+\. /, ""));
  return { dom, w, choose, order, warnings, writes, stored: () => JSON.parse(w.localStorage.getItem("tax-practice-v2:user-1")) };
}

test("Clients contract sorting works on desktop and mobile, persists, reverses, and preserves unknown dates", async () => {
  for (const mobile of [false, true]) {
    const d = await clients(mobile);
    try {
      assert.deepEqual(d.warnings, []);
      d.choose("client-order", "contract-oldest");
      assert.deepEqual(d.order(), ["Oldest", "Legacy", "Newer", "Future", "Unknown"]);
      assert.equal(d.w.document.querySelector("#client-order").closest(".mobile-only"), null);
      assert.deepEqual(d.stored().ui.sorts.clients, { key: "contractStart", dir: "asc" });
      d.w.document.querySelector('[aria-label="Reverse client sort"]').click();
      assert.equal(d.w.document.getElementById("client-order").value, "contract-newest");
      assert.deepEqual(d.order(), ["Future", "Newer", "Legacy", "Oldest", "Unknown"]);
      const reopened = await clients(mobile, d.stored().ui);
      try { assert.equal(reopened.w.document.getElementById("client-order").value, "contract-newest"); assert.deepEqual(reopened.order(), d.order()); }
      finally { reopened.dom.window.close(); }
      assert.deepEqual(d.writes, []);
    } finally { d.dom.window.close(); }
  }
});

test("contract order composes with PIC/search filters and keeps inactive clients in their archive", async () => {
  const d = await clients();
  try {
    d.choose("client-order", "contract-newest"); d.choose("active-client-pic-filter", "Budi");
    assert.deepEqual(d.order(), ["Future", "Oldest", "Unknown"]);
    const search = d.w.document.getElementById("active-client-search"); search.value = "Future"; search.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.deepEqual(d.order(), ["Future"]);
    const resetSearch = d.w.document.getElementById("active-client-search"); resetSearch.value = ""; resetSearch.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    d.w.document.querySelector('[data-client-tab="inactive"]').click();
    assert.deepEqual(d.order(), ["Archived"]);
    assert.equal(d.w.document.getElementById("client-order").value, "contract-newest");
    assert.deepEqual(d.writes, []); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("On Demand clients have a separate tab, can move to contracts, and Allocation engagement/PIC filters compose", async () => {
  const d = await clients();
  try {
    assert.equal(d.w.document.getElementById("client-order").value, "contract-newest");
    assert.equal(d.order().includes("Annual Only"), false);
    d.w.document.querySelector('[data-client-tab="on-demand"]').click();
    assert.deepEqual(d.order(), ["Annual Only"]);
    d.w.document.querySelector('.nav-btn[data-view="allocation-view"]').click();
    d.choose('allocation-engagement-filter','on_demand');
    assert.equal(d.w.document.querySelectorAll('#allocation-view [data-allocation-select]').length,1);
    d.choose('allocation-tax-filter','Budi');
    assert.equal(d.w.document.querySelectorAll('#allocation-view [data-allocation-select]').length,0);
    d.w.document.querySelector('.nav-btn[data-view="client-management-view"]').click();
    d.w.document.querySelector('[data-client-tab="on-demand"]').click();
    d.w.document.querySelector('[data-client-select-all]').click();d.w.document.querySelector('[data-move-client-engagement]').click();await tick();
    assert.equal(d.writes.length,1);assert.equal(d.order().includes('Annual Only'),true);
    d.w.document.querySelector('[data-client-tab="on-demand"]').click();assert.deepEqual(d.order(),[]);
    assert.deepEqual(d.warnings,[]);
  } finally { d.dom.window.close(); }
});
