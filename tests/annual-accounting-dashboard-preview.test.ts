import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const dashboard = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");
const previewScript = readFileSync(new URL("../public/annual-accounting-dashboard-preview.js", import.meta.url), "utf8");

async function openDashboard(preview: boolean) {
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole(); virtualConsole.on("error", (...args) => errors.push(args.map(value => value?.stack || String(value)).join(" ")));
  const dom = new JSDOM(dashboard, { runScripts: "outside-only", url: `file:///dashboard/demo.html${preview ? "?annualAccountingPreview=1" : ""}`, virtualConsole });
  const w = dom.window as any;
  const cache = new Map<string, string>(); let cacheWrites = 0, requests = 0;
  Object.defineProperty(w, "localStorage", { value: { getItem: (key: string) => cache.get(key) ?? null, setItem: (key: string, value: string) => { cacheWrites++; cache.set(key, value); }, removeItem: (key: string) => cache.delete(key) } });
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.history.replaceState = () => {}; w.history.pushState = () => {};
  w.fetch = async () => { requests++; throw new Error("Unexpected network request"); };
  w.Response = Response; w.Headers = Headers;
  w.structuredClone = structuredClone;
  w.eval(readFileSync(new URL("../public/vendor/purify.min.js", import.meta.url), "utf8"));
  w.eval(readFileSync(new URL("../public/workspace-sync.js", import.meta.url), "utf8"));
  const append = w.document.head.append.bind(w.document.head);
  w.document.head.append = (...nodes: any[]) => {
    for (const node of nodes) {
      append(node);
      if (node.tagName === "SCRIPT" && node.src.endsWith("annual-accounting-dashboard-preview.js")) { w.eval(previewScript); queueMicrotask(() => node.onload()); }
    }
  };
  const inline = dashboard.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inline);
  await w.eval(inline);
  if (errors.length) { dom.window.close(); throw new Error(errors.join("\n")); }
  if (preview) { const frame = w.document.getElementById("annual-integrated-frame"); w.dispatchEvent(new w.MessageEvent("message", { source: frame.contentWindow, data: { type: "annual-accounting-preview:state", payload: { team: "accounting", year: 2025, total: 14, open: 12, complete: 2, actorId: "supervisor-demo" } } })); }
  return { dom, w, get cacheWrites() { return cacheWrites; }, get requests() { return requests; } };
}

test("integrated accounting preview reuses the dashboard shell and retains its iframe across navigation", async () => {
  const d = await openDashboard(true);
  try {
    const frame = d.w.document.getElementById("annual-integrated-frame");
    assert.ok(frame, d.w.document.body.textContent.slice(-200));
    const container = frame.parentElement;
    assert.equal(container.hidden, false);
    assert.match(frame.src, /annual-accounting-sheet-demo\.html\?embedded=1$/);
    assert.ok(d.w.document.querySelector(".sidebar .nav-btn"));
    assert.equal(d.w.document.getElementById("sidebar-user-name").textContent, "Ivan");
    d.w.document.querySelector('[data-operations-mode="monthly"]').click();
    assert.equal(container.hidden, true);
    d.w.document.querySelector('[data-operations-mode="annual"]').click();
    assert.equal(container.hidden, false);
    d.w.document.querySelector('.nav-btn[data-view="cases-view"]').click();
    assert.equal(container.hidden, true);
    d.w.document.querySelector('.nav-btn[data-view="matrix-view"]').click();
    assert.equal(container.hidden, false);
    assert.equal(d.w.document.getElementById("annual-integrated-frame"), frame);
    assert.equal(frame.parentElement, container);
    assert.equal(d.cacheWrites, 0);
    assert.equal(d.requests, 0);
  } finally { d.dom.window.close(); }
});

test("embedded sample metrics and role update the shell only from the known iframe", async () => {
  const d = await openDashboard(true);
  try {
    const frame = d.w.document.getElementById("annual-integrated-frame");
    const payload = { year: 2024, total: 4, open: 0, complete: 4, actorId: "acc-cemari" };
    d.w.dispatchEvent(new d.w.MessageEvent("message", { source: d.w, data: { type: "annual-accounting-preview:state", payload } }));
    assert.equal(d.w.document.getElementById("sidebar-user-name").textContent, "Ivan");
    d.w.dispatchEvent(new d.w.MessageEvent("message", { source: frame.contentWindow, data: { type: "annual-accounting-preview:state", payload } }));
    assert.equal(d.w.document.getElementById("sidebar-user-name").textContent, "Cemari");
    assert.equal(d.w.document.querySelector("[data-preview-total]").textContent, "4 annual rows");
    assert.match(d.w.document.getElementById("workspace-breadcrumb").textContent, /Accounting \/ 2024$/);
  } finally { d.dom.window.close(); }
});

test("normal offline dashboard does not activate or load the accounting integration preview", async () => {
  const d = await openDashboard(false);
  try {
    assert.equal(d.w.AnnualDashboardPreview, undefined);
    assert.equal(d.w.document.getElementById("annual-integrated-frame"), null);
    assert.ok(d.w.document.querySelector('[data-operations-mode="monthly"].solid-btn'));
  } finally { d.dom.window.close(); }
});

test("Accounting and Tax keep separate frames and coordinate role changes across team tabs", async () => {
  const d = await openDashboard(true);
  try {
    const accounting = d.w.document.getElementById("annual-integrated-frame");
    d.w.document.querySelector('[data-annual-team="tax"]').click();
    const tax = d.w.document.getElementById("annual-tax-integrated-frame");
    assert.ok(tax); assert.match(tax.src, /embedded=1&team=tax$/);
    assert.equal(accounting.parentElement.hidden, true); assert.equal(tax.parentElement.hidden, false);
    const send = (frame: any, team: string, actorId: string) => d.w.dispatchEvent(new d.w.MessageEvent("message", { source: frame.contentWindow, data: { type: "annual-accounting-preview:state", payload: { team, year: 2025, total: team === "tax" ? 10 : 14, open: team === "tax" ? 8 : 12, complete: 2, actorId } } }));
    send(tax, "tax", "supervisor-demo"); send(tax, "tax", "tax-bagus");
    assert.equal(d.w.document.getElementById("sidebar-user-name").textContent, "Bagus");
    d.w.document.querySelector('[data-annual-team="accounting"]').click();
    send(accounting, "accounting", "supervisor-demo");
    assert.equal(d.w.document.getElementById("sidebar-user-name").textContent, "Bagus");
    send(accounting, "accounting", "tax-bagus");
    assert.equal(d.w.document.getElementById("annual-integrated-frame"), accounting);
    d.w.document.querySelector('[data-annual-team="tax"]').click();
    assert.equal(d.w.document.getElementById("annual-tax-integrated-frame"), tax);
    assert.equal(tax.parentElement.hidden, false);
    assert.equal(d.requests, 0);
  } finally { d.dom.window.close(); }
});
