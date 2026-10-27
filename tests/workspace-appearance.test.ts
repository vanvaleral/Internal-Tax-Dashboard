import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const dashboard = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");
const sheetHtml = readFileSync(new URL("../public/annual-accounting-sheet-demo.html", import.meta.url), "utf8");
const sheetScript = readFileSync(new URL("../public/annual-accounting-sheet-demo.js", import.meta.url), "utf8");

async function openDashboard(saved?: any) {
  const errors: string[] = [], messages: any[] = [], cache = new Map<string, string>();
  if (saved) cache.set("tax-practice-v2:offline-preview", JSON.stringify({ ui: { appearance: saved } }));
  const virtualConsole = new VirtualConsole(); virtualConsole.on("error", (...items) => errors.push(items.map(item => item?.stack || String(item)).join(" ")));
  const dom = new JSDOM(dashboard, { runScripts: "outside-only", url: "file:///dashboard/demo.html", virtualConsole });
  const w = dom.window as any;
  Object.defineProperty(w, "localStorage", { value: { getItem: (key: string) => cache.get(key) ?? null, setItem: (key: string, value: string) => cache.set(key, value), removeItem: (key: string) => cache.delete(key) } });
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.history.replaceState = () => {}; w.history.pushState = () => {};
  w.Response = Response; w.Headers = Headers; w.structuredClone = structuredClone;
  w.AnnualDashboardSheets = { setAppearance(value: any) { messages.push(value); } };
  w.eval(readFileSync(new URL("../public/vendor/purify.min.js", import.meta.url), "utf8"));
  w.eval(readFileSync(new URL("../public/workspace-sync.js", import.meta.url), "utf8"));
  await w.eval(dashboard.match(/<script>([\s\S]*?)<\/script>/)![1]);
  assert.deepEqual(errors, []);
  return { dom, w, cache, messages, settings() { w.document.querySelector("[data-open-appearance-settings]").click(); } };
}

test("Annual Green is the first-load default across dashboard tokens and settings", async () => {
  const d = await openDashboard();
  try {
    const root = d.w.document.documentElement;
    assert.equal(root.style.getPropertyValue("--accent"), "#087f8d");
    assert.equal(root.style.getPropertyValue("--accent-soft"), "#e7f4f3");
    assert.equal(d.w.document.body.classList.contains("theme-dark"), false);
    assert.equal(d.w.getComputedStyle(root).getPropertyValue("--canvas").trim(), "#f0f2ee");
    d.settings();
    assert.equal(d.w.document.querySelector(".appearance-swatch.active").dataset.setAccent, "#087f8d");
    assert.match(d.w.document.querySelector(".appearance-swatch.active").getAttribute("aria-label"), /Annual Green/);
    assert.ok(d.w.document.querySelector("[data-restore-annual-green]"));
    assert.equal(d.messages.at(-1).accent, "#087f8d");
  } finally { d.dom.window.close(); }
});

test("saved customization survives the new default and reset preserves the uploaded background", async () => {
  const image = "data:image/png;base64,AAAA", d = await openDashboard({ theme: "dark", accent: "#2563eb", myWorkBackground: image });
  try {
    const root = d.w.document.documentElement;
    assert.equal(root.style.getPropertyValue("--accent"), "#2563eb");
    assert.equal(d.w.document.body.classList.contains("theme-dark"), true);
    d.settings(); d.w.document.querySelector("[data-restore-annual-green]").click();
    assert.equal(root.style.getPropertyValue("--accent"), "#087f8d");
    assert.equal(d.w.document.body.classList.contains("theme-dark"), false);
    const stored = JSON.parse(d.cache.get("tax-practice-v2:offline-preview")!);
    assert.deepEqual(stored.ui.appearance, { theme: "light", accent: "#087f8d", myWorkBackground: image });
    assert.equal(d.w.document.querySelector("#appearance-my-work-background").value, "");
  } finally { d.dom.window.close(); }
});

test("Settings still supports presets, arbitrary color and dark mode with readable primary-button text", async () => {
  const d = await openDashboard();
  try {
    d.settings(); d.w.document.querySelector('[data-set-accent="#be185d"]').click();
    assert.equal(d.w.document.documentElement.style.getPropertyValue("--accent"), "#be185d");
    const custom = d.w.document.getElementById("appearance-custom-color");
    custom.value = "#ffff00"; custom.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.equal(d.w.document.documentElement.style.getPropertyValue("--accent"), "#ffff00");
    assert.equal(d.w.document.documentElement.style.getPropertyValue("--accent-contrast"), "#142b2f");
    d.w.document.querySelector('[data-set-theme="dark"]').click();
    assert.equal(d.w.document.body.classList.contains("theme-dark"), true);
    assert.equal(d.messages.at(-1).theme, "dark");
    const stored = JSON.parse(d.cache.get("tax-practice-v2:offline-preview")!);
    assert.equal(stored.ui.appearance.accent, "#ffff00"); assert.equal(stored.ui.appearance.theme, "dark");
  } finally { d.dom.window.close(); }
});

test("annual appearance messages are source/origin checked and do not replace cells or alter work/roles", () => {
  for (const team of ["accounting", "tax"]) {
    const parent = new JSDOM("", { url: "http://localhost/demo.html" });
    const dom = new JSDOM(sheetHtml, { runScripts: "outside-only", url: `http://localhost/annual-accounting-sheet-demo.html?embedded=1&team=${team}` });
    const w = dom.window as any;
    try {
      Object.defineProperty(w, "parent", { value: parent.window });
      w.matchMedia = () => ({ matches: false });
      if (team === "tax") w.eval(readFileSync(new URL("../public/annual-tax-sheet-config.js", import.meta.url), "utf8"));
      w.eval(sheetScript);
      const before = JSON.stringify(w.AnnualSheetDemo.state.rows), actor = w.AnnualSheetDemo.state.actorId;
      const c = w.AnnualSheetDemo.columns.findIndex((col: any) => col.field === "notes"), cell = w.document.querySelector(`td[data-r="0"][data-c="${c}"]`);
      cell.dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, button: 0 })); w.document.dispatchEvent(new w.MouseEvent("pointerup", { bubbles: true }));
      cell.dispatchEvent(new w.KeyboardEvent("keydown", { bubbles: true, key: "F2" }));
      const editor = cell.querySelector("input"); assert.ok(editor); editor.value = "Unfinished edit";
      const send = (appearance: any, origin = "http://localhost", source: any = parent.window) => w.dispatchEvent(new w.MessageEvent("message", { origin, source, data: { type: "annual-sheet:appearance", appearance } }));
      send({ theme: "dark", accent: "#be185d" }, "http://evil.example");
      send({ theme: "dark", accent: "#be185d" }, "http://localhost", w);
      assert.equal(w.document.documentElement.classList.contains("sheet-theme-dark"), false);
      send({ theme: "dark", accent: "#be185d" });
      assert.equal(w.document.documentElement.classList.contains("sheet-theme-dark"), true);
      assert.equal(w.document.documentElement.style.getPropertyValue("--cyan"), "#be185d");
      assert.equal(cell.querySelector("input"), editor); assert.equal(editor.value, "Unfinished edit");
      assert.equal(w.document.activeElement, editor);
      assert.equal(JSON.stringify(w.AnnualSheetDemo.state.rows), before); assert.equal(w.AnnualSheetDemo.state.actorId, actor);
      send({ theme: "dark", accent: 'url("https://evil.example")' });
      assert.equal(w.document.documentElement.style.getPropertyValue("--cyan"), "#be185d");
      const url = new URL(w.document.getElementById("fullscreen-button").href);
      assert.equal(url.searchParams.get("accent"), "#be185d"); assert.equal(url.searchParams.get("theme"), "dark");
    } finally { dom.window.close(); parent.window.close(); }
  }
});

test("annual full-screen links retain validated theme settings without inheriting role or identity claims", () => {
  for (const color of ["#ffcc00", "not-a-color"]) {
    const dom = new JSDOM(sheetHtml, { runScripts: "outside-only", url: `http://localhost/annual-accounting-sheet-demo.html?fullscreen=1&theme=dark&accent=${encodeURIComponent(color)}&role=supervisor` });
    const w = dom.window as any;
    try {
      w.matchMedia = () => ({ matches: false }); w.eval(sheetScript);
      assert.equal(w.document.documentElement.classList.contains("sheet-theme-dark"), true);
      assert.equal(w.document.documentElement.style.getPropertyValue("--cyan"), color === "not-a-color" ? "#087f8d" : color);
      const link = new URL(w.document.querySelector('[data-sheet-team="tax"]').href);
      assert.equal(link.searchParams.get("theme"), "dark"); assert.equal(link.searchParams.has("role"), false);
    } finally { dom.window.close(); }
  }
});

test("dashboard applies appearance to future and existing annual frames without a data request", () => {
  const dom = new JSDOM('<main class="main"><div id="matrix-view"></div></main>', { runScripts: "outside-only", url: "http://localhost/demo.html" });
  const w = dom.window as any, messages: any[] = [];
  try {
    w.fetch = () => { throw new Error("Appearance must not load data"); };
    w.eval(readFileSync(new URL("../public/annual-sheet-dashboard.js", import.meta.url), "utf8"));
    const api = w.AnnualDashboardSheets;
    api.configure(() => {}, "user-1"); api.setAppearance({ theme: "dark", accent: "#be185d" });
    api.render(w.document.getElementById("matrix-view"), { currentView: "matrix-view", operationsMode: "annual", annualTeam: "tax" });
    const frame = w.document.querySelector("iframe"), url = new URL(frame.src);
    assert.equal(url.searchParams.get("theme"), "dark"); assert.equal(url.searchParams.get("accent"), "#be185d"); assert.equal(url.searchParams.get("account"), "user-1");
    frame.contentWindow.postMessage = (message: any, origin: string) => messages.push({ message, origin });
    api.setAppearance({ theme: "light", accent: "#087f8d" });
    assert.equal(messages.at(-1).message.appearance.theme, "light"); assert.equal(messages.at(-1).message.appearance.accent, "#087f8d");
    assert.equal(messages.at(-1).origin, "http://localhost");
    const count = messages.length;
    api.setAppearance({ theme: "dark", accent: "invalid" }); assert.equal(messages.length, count);
    assert.equal(w.document.querySelector("iframe"), frame);
  } finally { dom.window.close(); }
});
