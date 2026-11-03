import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const html = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");

function atWidth(width: number) {
  const dom = new JSDOM(html, { runScripts: "outside-only" }), w = dom.window;
  // jsdom has no viewport layout engine; apply only matching width-based rules.
  const matches = (query: string) => !/prefers-|max-height|min-height/.test(query) &&
    [...query.matchAll(/(min|max)-width:\s*(\d+)px/g)].every(([, kind, value]) => kind === "min" ? width >= Number(value) : width <= Number(value));
  for (const style of w.document.querySelectorAll("style")) {
    const flatten = (rules: CSSRuleList): string => [...rules].map((rule: any) => rule.media ? matches(rule.conditionText) ? flatten(rule.cssRules) : "" : rule.cssText).join("\n");
    style.textContent = flatten(style.sheet!.cssRules);
  }
  const css = (selector: string) => w.getComputedStyle(w.document.querySelector(selector)!);
  const media = [
    { matches: width >= 901, listeners: [] as Array<() => void> },
    { matches: width >= 901 && width <= 1100, listeners: [] as Array<() => void> }
  ];
  w.matchMedia = ((query: string) => {
    const index = query === "(min-width: 901px)" ? 0 : query === "(min-width: 901px) and (max-width: 1100px)" ? 1 : -1;
    assert.notEqual(index, -1);
    const item = media[index];
    return { get matches() { return item.matches; }, addEventListener(_event: string, listener: () => void) { item.listeners.push(listener); } };
  }) as any;
  (w as any).fetch = () => { throw new Error("Sidebar sizing must not fetch workspace data"); };
  w.eval(w.document.querySelector("script[data-compact-navigation]")!.textContent!);
  return {
    dom, w, css, toggle: w.document.getElementById("compact-rail-toggle")!, sidebar: w.document.getElementById("workspace-sidebar")!,
    resize(width: number) {
      media[0].matches = width >= 901; media[1].matches = width >= 901 && width <= 1100;
      media.forEach(item => item.listeners.forEach(listener => listener()));
    }
  };
}

test("wide desktop starts with a roomier full sidebar and bounded, evenly spaced workspace", () => {
  for (const width of [1440, 1920, 2560]) {
    const d = atWidth(width);
    try {
      assert.equal(d.css(".shell").maxWidth, "1920px");
      assert.equal(d.css(".shell").paddingLeft, "22px");
      assert.equal(d.css(".shell").gap, "22px");
      assert.equal(d.css(".shell").gridTemplateColumns, "260px minmax(0, 1fr)");
      assert.equal(d.css(".sidebar").width, "260px");
      assert.equal(d.css(".sidebar").padding, "18px");
      assert.equal(d.toggle.getAttribute("aria-expanded"), "true");
      assert.equal(d.toggle.getAttribute("aria-label"), "Use mini sidebar");
      assert.equal(d.sidebar.hasAttribute("inert"), false);
      assert.equal(d.sidebar.hasAttribute("aria-hidden"), false);
    } finally { d.dom.window.close(); }
  }
});

test("mini is a persistent interactive rail, not a hidden sidebar or hover popup", () => {
  const d = atWidth(1920);
  try {
    d.toggle.click();
    assert.equal(d.css(".shell").gridTemplateColumns, "84px minmax(0, 1fr)");
    assert.equal(d.css(".sidebar").width, "84px");
    assert.equal(d.css(".sidebar").visibility, "visible");
    assert.notEqual(d.css(".sidebar").display, "none");
    assert.equal(d.css(".sidebar-stack").display, "none");
    assert.equal(d.css(".nav-btn").flexDirection, "column");
    assert.equal(d.css(".mobile-nav-icon").display, "grid");
    assert.equal(d.css(".topbar-actions .mobile-attendance-trigger").display, "inline-flex");
    assert.equal(d.toggle.getAttribute("aria-expanded"), "false");
    assert.equal(d.toggle.getAttribute("aria-label"), "Show full sidebar");
    assert.equal(d.sidebar.hasAttribute("inert"), false);
    assert.equal(d.sidebar.hasAttribute("aria-hidden"), false);
    assert.equal(d.w.document.querySelector(".compact-sidebar-preview,.sidebar-reveal-zone"), null);
    const state = d.w.document.documentElement.className;
    d.sidebar.dispatchEvent(new d.w.Event("pointerleave"));
    d.w.document.dispatchEvent(new d.w.Event("pointermove"));
    d.w.dispatchEvent(new d.w.Event("blur"));
    assert.equal(d.w.document.documentElement.className, state, "pointer movement/window blur cannot hide the rail");
    d.toggle.click();
    assert.equal(d.css(".sidebar").width, "260px");
    assert.notEqual(d.css(".sidebar-stack").display, "none");
  } finally { d.dom.window.close(); }
});

test("half-width desktop defaults to mini without stacking, and permits explicit full mode", () => {
  for (const width of [901, 940, 1024, 1100]) {
    const d = atWidth(width);
    try {
      assert.equal(d.css(".shell").gridTemplateColumns, "84px minmax(0, 1fr)");
      assert.equal(d.css(".sidebar").position, "sticky");
      assert.equal(d.css(".shell").paddingLeft, "14px");
      assert.equal(d.css(".shell").gap, "18px");
      assert.equal(d.css(".compact-rail-toggle").display, "grid");
      assert.equal(d.css(".mobile-nav-only").display, "none");
      assert.notEqual(d.css('[data-view="matrix-view"]').display, "none");
      assert.notEqual(d.css('[data-view="allocation-view"]').display, "none");
      d.toggle.click();
      assert.equal(d.css(".shell").gridTemplateColumns, "260px minmax(0, 1fr)");
      assert.equal(d.css(".sidebar").width, "260px");
    } finally { d.dom.window.close(); }
  }
});

test("size selection survives desktop resizing but mobile restores bottom navigation and reload restores defaults", () => {
  const d = atWidth(1440);
  try {
    d.toggle.click(); d.resize(940);
    assert.equal(d.w.document.documentElement.classList.contains("desktop-nav-mini"), true);
    d.resize(390);
    assert.equal(d.w.document.documentElement.classList.contains("desktop-nav-mini"), false);
    assert.equal((d.toggle as HTMLButtonElement).disabled, true);
    assert.equal(d.sidebar.hasAttribute("inert"), false);
    d.resize(1440);
    assert.equal(d.w.document.documentElement.classList.contains("desktop-nav-mini"), true);
    d.toggle.click(); d.resize(940);
    assert.equal(d.w.document.documentElement.classList.contains("desktop-nav-mini"), false, "explicit Full remains Full in a narrow window");
  } finally { d.dom.window.close(); }
  const fresh = atWidth(1440);
  try { assert.equal(fresh.toggle.getAttribute("aria-expanded"), "true"); } finally { fresh.dom.window.close(); }
});

test("sidebar resizing retains workspace DOM, edited input selection, frames and existing role rules", () => {
  const d = atWidth(1440);
  try {
    const main = d.w.document.querySelector(".main")!, input = d.w.document.createElement("input"), frame = d.w.document.createElement("iframe");
    main.append(input, frame); input.value = "Unsaved work"; input.focus(); input.setSelectionRange(2, 5);
    const contents = main.innerHTML;
    const restricted = d.sidebar.querySelector<HTMLButtonElement>("[data-supervisor-only]")!; restricted.hidden = true;
    d.toggle.click();
    assert.equal(main.innerHTML, contents); assert.equal(d.w.document.activeElement, input); assert.equal(input.selectionStart, 2);
    assert.equal(main.querySelector("iframe"), frame);
    assert.equal(d.w.getComputedStyle(restricted).display, "none");
    assert.equal(input.value, "Unsaved work");
    const menu = d.sidebar.querySelector<HTMLButtonElement>('[data-view="cases-view"]')!;
    let clicks = 0; menu.addEventListener("click", () => { clicks++; }); menu.click();
    assert.equal(clicks, 1); assert.equal(d.w.document.documentElement.classList.contains("desktop-nav-mini"), true);
  } finally { d.dom.window.close(); }
});

test("double-click title/background switches size but menu buttons and inputs do not", () => {
  const d = atWidth(1440);
  try {
    d.sidebar.querySelector("h1")!.dispatchEvent(new d.w.MouseEvent("dblclick", { bubbles:true }));
    assert.equal(d.w.document.documentElement.classList.contains("desktop-nav-mini"), true);
    d.sidebar.querySelector(".nav-btn")!.dispatchEvent(new d.w.MouseEvent("dblclick", { bubbles:true }));
    assert.equal(d.w.document.documentElement.classList.contains("desktop-nav-mini"), true);
    const input = d.w.document.createElement("input"); d.sidebar.append(input);
    input.dispatchEvent(new d.w.MouseEvent("dblclick", { bubbles:true }));
    assert.equal(d.w.document.documentElement.classList.contains("desktop-nav-mini"), true);
    d.sidebar.dispatchEvent(new d.w.MouseEvent("dblclick", { bubbles:true }));
    assert.equal(d.w.document.documentElement.classList.contains("desktop-nav-mini"), false);
  } finally { d.dom.window.close(); }
});

test("mini and mobile share the same clean labeled SVG icon family", () => {
  for (const width of [390, 940]) {
    const d = atWidth(width);
    try {
      const icons = [...d.w.document.querySelectorAll<SVGElement>(".nav .mobile-nav-icon svg")];
      assert.equal(icons.length, 8);
      assert.equal(new Set(icons.map(icon => icon.dataset.navSymbol)).size, 8);
      for (const icon of icons) {
        assert.equal(icon.getAttribute("viewBox"), "0 0 24 24");
        const style = d.w.getComputedStyle(icon);
        assert.equal(style.width, "24px"); assert.equal(style.height, "24px");
        assert.equal(style.strokeWidth, "1.75");
        assert.ok(icon.children.length <= 3);
      }
      for (const menu of d.sidebar.querySelectorAll(".nav-btn:not(.mobile-nav-only)")) assert.ok(menu.querySelector(".nav-desktop-label")!.textContent!.trim());
    } finally { d.dom.window.close(); }
  }
});

test("desktop handle stays centered on hover/press and has reduced-motion support", () => {
  const d = atWidth(1440);
  try {
    const rules = [...d.w.document.styleSheets].flatMap(sheet => [...sheet.cssRules]) as CSSStyleRule[];
    const hover = rules.find(rule => rule.selectorText?.includes(".compact-rail-toggle:hover:not(:disabled)"))!;
    assert.equal(hover.style.transform, "translateY(-50%)");
    assert.ok(hover.selectorText.includes(".compact-rail-toggle:active:not(:disabled)"));
    assert.match(html, /\.compact-rail-toggle, \.compact-rail-toggle svg \{ transition: none !important; \}/);
    const script = d.w.document.querySelector("script[data-compact-navigation]")!.textContent!;
    assert.doesNotMatch(script, /setTimeout|pointerenter|pointerleave|pointermove|localStorage|fetch\(/);
  } finally { d.dom.window.close(); }
});

test("mobile keeps fixed bottom navigation and Cases Full Screen has no desktop toggle", () => {
  for (const width of [390, 900]) {
    const d = atWidth(width);
    try {
      assert.equal(d.css(".sidebar").position, "fixed");
      assert.equal(d.css(".nav").gridTemplateColumns, "repeat(5, minmax(0, 1fr))");
      assert.equal(d.css(".compact-rail-toggle").display, "none");
      assert.equal(d.css('.nav-btn[data-view="matrix-view"]').display, "none");
    } finally { d.dom.window.close(); }
  }
  const d = atWidth(1440);
  try {
    d.w.document.documentElement.classList.add("cases-fullscreen");
    d.resize(1440);
    assert.equal(d.css(".sidebar").display, "none");
    assert.equal(d.css(".compact-rail-toggle").display, "none");
    assert.equal((d.toggle as HTMLButtonElement).disabled, true);
    d.toggle.click();
    assert.equal(d.w.document.documentElement.classList.contains("desktop-nav-mini"), false);
    assert.equal(d.css(".shell").display, "block");
  } finally { d.dom.window.close(); }
});
