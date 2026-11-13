import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
import { isPublicUiAsset } from "../lib/public-ui-assets.ts";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("the removed bulk editor has no tab, assets, API or implementation while import review and the Cases X remain", () => {
  const html = read("public/demo.html");
  assert.doesNotMatch(html, /ClientBulkEdit|client-bulk-edit|data-client-tab="bulk-edit"/);
  for (const file of ["app/api/clients/bulk-edit/route.ts", "lib/client-bulk-edit.ts", "public/client-bulk-edit.js", "public/client-bulk-edit.css"]) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false);
  for (const asset of ["/client-bulk-edit.js", "/client-bulk-edit.css"]) assert.equal(isPublicUiAsset(asset, "GET"), false);
  assert.match(html, /data-import-name-choice/);
  assert.match(html, /case-progress-remove/);
});

test("a remembered Bulk Edit tab falls back to Active Clients without clearing other preferences", async () => {
  const warnings: string[] = [], vc = new VirtualConsole();
  vc.on("jsdomError", error => warnings.push(error.message));
  const dom = new JSDOM(read("public/demo.html"), { url: "http://localhost/demo.html", runScripts: "outside-only", virtualConsole: vc }), w = dom.window as any;
  try {
    w.localStorage.setItem("tax-practice-v2:removal-user", JSON.stringify({ ui: { currentView: "client-management-view", clientManagementTab: "bulk-edit", clientSearch: "Example" } }));
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
    w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
    w.Headers = Headers; w.Response = Response; w.structuredClone = structuredClone;
    w.fetch = async (url: string) => ({ ok: true, status: 200, json: async () => url === "/api/profile"
      ? { user: { id: "removal-user" }, profile: { id: "supervisor", role: "supervisor", display_name: "Supervisor", directory_active: true } }
      : url === "/api/clients" ? { data: [{ id: "master", client_code: "CL-00001", legal_name: "Example Client", status: "Active" }] }
      : { data: [], tasks: [], staff: [], announcements: [] } });
    for (const file of ["public/vendor/purify.min.js", "public/workspace-sync.js", "public/feature-access.js", "public/client-engagement.js", "public/annual-sheet-dashboard.js"]) w.eval(read(file));
    await w.eval(read("public/demo.html").match(/<script>([\s\S]*?)<\/script>/)![1]);
    await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
    assert.equal(w.document.querySelector('[data-client-tab="active"]').classList.contains("solid-btn"), true);
    assert.equal(w.document.querySelector("#active-client-search").value, "Example");
    assert.equal(w.document.querySelector(".client-fab").getAttribute("data-new-client"), "yes");
    assert.equal(w.document.querySelector('[data-client-tab="bulk-edit"]'), null);
    assert.deepEqual(warnings, []);
  } finally { dom.window.close(); }
});
