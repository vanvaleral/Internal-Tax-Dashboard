import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dashboard = read("public/demo.html");
const visibility = dashboard.match(/    function applyViewVisibility\(viewId\) \{[\s\S]*?\n    \}/)![0];

test("central menu visibility hides both stable annual sheets before rendering another workspace", () => {
  const dom = new JSDOM('<main class="main"><div id="matrix-view" class="view"></div><div id="cases-view" class="view hidden"></div></main>', { runScripts: "outside-only", url: "http://localhost/demo.html" });
  const w = dom.window as any;
  try {
    w.eval(read("public/annual-sheet-dashboard.js"));
    const api = w.AnnualDashboardSheets, root = w.document.getElementById("matrix-view");
    const state = { currentView: "matrix-view", operationsMode: "annual", annualTeam: "accounting" };
    const apply = w.Function("state", "IS_OFFLINE_DEMO", "IS_ANNUAL_SHEET_PREVIEW", `${visibility}; return applyViewVisibility;`)(state, false, false);
    api.render(root, state); const acc = w.document.querySelector("iframe");
    state.annualTeam = "tax"; api.render(root, state); const tax = w.document.querySelectorAll("iframe")[1];
    tax.contentDocument.open(); tax.contentDocument.write("<!doctype html><html><body></body></html>"); tax.contentDocument.close();
    const draft = tax.contentDocument.createElement("input"); draft.value = "Unfinished new client"; tax.contentDocument.body.append(draft);
    const originalSrc = tax.src;
    const style = w.document.createElement("style");
    style.textContent = `.annual-sheet-container{display:block}${dashboard.match(/    \.annual-sheet-container\[hidden\],[\s\S]*?\n    \}/)![0]}`;
    w.document.head.append(style);
    assert.equal(tax.parentElement.hidden, false);
    for (const view of ["cases-view", "client-management-view", "my-work-view", "dashboard-view", "allocation-view", "profile-view", "announcement-view", "client-view"]) {
      state.currentView = view; apply(view);
      assert.equal(acc.parentElement.hidden, true, view); assert.equal(tax.parentElement.hidden, true, view);
      assert.equal(w.getComputedStyle(tax.parentElement).display, "none", "hiding must not depend on the optional annual stylesheet");
      // Delayed readiness/theme messages must not reopen an annual sheet under Cases.
      w.dispatchEvent(new w.MessageEvent("message", { origin: "http://localhost", source: tax.contentWindow, data: { type: "annual-sheet:state", team: "tax" } }));
      api.setAppearance({ theme: "dark", accent: "#087f8d" });
      assert.equal(tax.parentElement.hidden, true);
    }
    state.currentView = "matrix-view"; state.operationsMode = "monthly"; apply("matrix-view");
    assert.equal(acc.parentElement.hidden, true); assert.equal(tax.parentElement.hidden, true);
    state.operationsMode = "annual"; apply("matrix-view");
    assert.equal(acc.parentElement.hidden, true); assert.equal(tax.parentElement.hidden, false);
    assert.equal(w.document.querySelectorAll("iframe")[1], tax); assert.equal(tax.src, originalSrc);
    assert.equal(tax.contentDocument.querySelector("input"), draft); assert.equal(draft.value, "Unfinished new client");
    assert.equal(w.document.querySelectorAll("iframe").length, 2);
  } finally { dom.window.close(); }
});

test("route changes synchronize stable sheet visibility before destination or shell rendering", () => {
  for (const name of ["switchView", "rerender"]) {
    const body = dashboard.match(new RegExp(`    function ${name}\\([^]*?\\n    \\}`))![0];
    assert.ok(body.indexOf("applyViewVisibility(") < body.indexOf("renderActiveView();"), `${name}: hide outgoing sheets before rendering can fail`);
    assert.equal(body.includes(".syncVisibility(state)"), false, "visibility belongs to the central step, not an optional final render step");
  }
});

test("central visibility also hides the offline annual integration preview without reloading it", () => {
  const dom = new JSDOM('<div id="workspace-breadcrumb"></div><main class="main"><div id="matrix-view" class="view"></div><div id="cases-view" class="view hidden"></div></main>', { runScripts: "outside-only", url: "file:///dashboard/demo.html?annualAccountingPreview=1" });
  const w = dom.window as any;
  try {
    w.eval(read("public/annual-accounting-dashboard-preview.js"));
    const state = { currentView: "matrix-view", operationsMode: "annual", annualTeam: "tax" }, root = w.document.getElementById("matrix-view");
    w.AnnualDashboardPreview.render(root, state);
    const frame = w.document.querySelector("iframe");
    const apply = w.Function("state", "IS_OFFLINE_DEMO", "IS_ANNUAL_SHEET_PREVIEW", `${visibility}; return applyViewVisibility;`)(state, true, true);
    state.currentView = "cases-view"; apply("cases-view");
    assert.equal(frame.parentElement.hidden, true);
    state.currentView = "matrix-view"; apply("matrix-view");
    assert.equal(frame.parentElement.hidden, false); assert.equal(w.document.querySelector("iframe"), frame);
  } finally { dom.window.close(); }
});
