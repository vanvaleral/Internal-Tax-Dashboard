import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const html = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");

function atWidth(width: number) {
  const dom = new JSDOM(html, { runScripts: "outside-only" }), w = dom.window;
  // jsdom has no viewport layout engine; apply only the matching width-based rules.
  const matches = (query: string) => !/prefers-|max-height|min-height/.test(query) &&
    [...query.matchAll(/(min|max)-width:\s*(\d+)px/g)].every(([, kind, value]) => kind === "min" ? width >= Number(value) : width <= Number(value));
  const styles = [...w.document.querySelectorAll("style")];
  for (const style of styles) {
    const flatten = (rules: CSSRuleList): string => [...rules].map((rule: any) => rule.media ? matches(rule.conditionText) ? flatten(rule.cssRules) : "" : rule.cssText).join("\n");
    style.textContent = flatten(style.sheet!.cssRules);
  }
  const css = (selector: string) => w.getComputedStyle(w.document.querySelector(selector)!);
  return { dom, w, css };
}

test("half-width desktop windows use a narrow sticky rail rather than stacking the full sidebar", () => {
  for (const width of [901, 940, 1024, 1100]) {
    const d = atWidth(width);
    try {
      assert.equal(d.css(".shell").gridTemplateColumns, "84px minmax(0, 1fr)");
      assert.equal(d.css(".sidebar").position, "sticky");
      assert.equal(d.css(".sidebar-stack").display, "none");
      assert.equal(d.css(".nav-desktop-subtitle").display, "none");
      assert.equal(d.css(".nav-btn").flexDirection, "column");
      assert.equal(d.css(".mobile-nav-icon").display, "grid");
      assert.notEqual(d.css('.nav-btn[data-view="matrix-view"]').display, "none");
      assert.notEqual(d.css('.nav-btn[data-view="dashboard-view"]').display, "none");
      assert.notEqual(d.css('.nav-btn[data-view="allocation-view"]').display, "none");
      assert.equal(d.css(".mobile-nav-only").display, "none");
      assert.equal(d.css(".global-topbar").flexDirection, "row");
      assert.equal(d.css(".compact-rail-toggle").display, "grid");
      assert.equal(d.css(".topbar-actions .mobile-attendance-trigger").display, "inline-flex");
      for (const button of d.w.document.querySelectorAll('.nav-btn:not(.mobile-nav-only)')) {
        assert.ok(button.querySelector(".mobile-nav-icon svg"), "every desktop menu needs its own rail icon");
        assert.ok(button.querySelector(".nav-desktop-label")!.textContent!.trim());
      }
      const restricted = d.w.document.querySelector<HTMLButtonElement>('[data-supervisor-only]')!;
      restricted.hidden = true;
      assert.equal(d.w.getComputedStyle(restricted).display, "none", "rail styling must honor role-based hiding");
    } finally { d.dom.window.close(); }
  }
});

test("slim and mobile navigation use one minimal, consistently sized theme-colored outline icon family", () => {
  for (const width of [390, 940]) {
    const d = atWidth(width);
    try {
      const icons = [...d.w.document.querySelectorAll<SVGElement>(".nav .mobile-nav-icon svg")];
      assert.equal(icons.length, 8);
      assert.equal(new Set(icons.map(icon => icon.dataset.navSymbol)).size, 8);
      const shared = [...d.w.document.styleSheets].flatMap(sheet => [...sheet.cssRules]).filter((rule: any) => rule.selectorText === ".mobile-nav-icon svg") as CSSStyleRule[];
      assert.equal(shared.length, 1, "desktop and mobile share the same icon styling");
      // jsdom cannot fully resolve inherited currentColor through theme variables.
      assert.equal(shared[0].style.getPropertyValue("fill"), "none");
      assert.equal(shared[0].style.getPropertyValue("stroke").toLowerCase(), "currentcolor");
      for (const icon of icons) {
        assert.equal(icon.getAttribute("viewBox"), "0 0 24 24");
        assert.equal(icon.parentElement!.getAttribute("aria-hidden"), "true", "labels provide the accessible menu name");
        const css = d.w.getComputedStyle(icon);
        assert.equal(css.width, "24px"); assert.equal(css.height, "24px");
        assert.equal(css.strokeWidth, "1.75"); assert.equal(css.strokeLinecap, "round"); assert.equal(css.strokeLinejoin, "round");
        assert.ok(icon.children.length <= 3, "avoid decorative or crowded detail at navigation size");
        assert.equal(icon.querySelector("image,text,foreignObject"), null);
      }
    } finally { d.dom.window.close(); }
  }
});

test("full desktop and mobile keep their existing sidebar and bottom-navigation layouts", () => {
  for (const width of [390, 900, 1101, 1440]) {
    const d = atWidth(width);
    try {
      if (width <= 900) {
        assert.equal(d.css(".shell").gridTemplateColumns, "1fr");
        assert.equal(d.css(".sidebar").position, "fixed");
        assert.equal(d.css(".nav").gridTemplateColumns, "repeat(5, minmax(0, 1fr))");
        assert.equal(d.css('.nav-btn[data-view="matrix-view"]').display, "none");
        assert.equal(d.css(".mobile-nav-only").display, "flex");
        assert.equal(d.css(".compact-rail-toggle").display, "none");
      } else {
        assert.equal(d.css(".shell").gridTemplateColumns, "240px 1fr");
        assert.equal(d.css(".sidebar").position, "sticky");
        assert.notEqual(d.css(".sidebar-stack").display, "none");
        assert.equal(d.css(".mobile-nav-icon").display, "none");
        assert.equal(d.css(".compact-rail-toggle").display, "none");
      }
    } finally { d.dom.window.close(); }
  }
});

test("Cases full-screen still hides navigation at the compact desktop breakpoint", () => {
  const d = atWidth(940);
  try {
    d.w.document.documentElement.classList.add("cases-fullscreen");
    assert.equal(d.css(".sidebar").display, "none");
    assert.equal(d.css(".compact-rail-toggle").display, "none");
    assert.equal(d.css(".shell").display, "block", "full-screen ignores the rail grid entirely");
  } finally { d.dom.window.close(); }
});

function mountToggle(d: ReturnType<typeof atWidth>, compact = true) {
  const listeners: Array<() => void> = [], viewport = { matches: compact, addEventListener(_event: string, listener: () => void) { listeners.push(listener); } };
  d.w.matchMedia = (() => viewport) as any;
  (d.w as any).fetch = () => { throw new Error("Collapsing navigation must not request workspace data"); };
  d.w.eval(d.w.document.querySelector("script[data-compact-navigation]")!.textContent!);
  return { toggle: d.w.document.getElementById("compact-rail-toggle")!, sidebar: d.w.document.getElementById("workspace-sidebar")!, change(compact: boolean) { viewport.matches = compact; listeners.forEach(listener => listener()); } };
}

test("compact rail can hide/reopen with an accessible edge handle without replacing workspace edits or frames", () => {
  const d = atWidth(940);
  try {
    const { toggle, sidebar } = mountToggle(d), main = d.w.document.querySelector(".main")!;
    const input = d.w.document.createElement("input"), frame = d.w.document.createElement("iframe");
    main.append(input, frame); input.value = "Unsaved work"; input.focus(); input.setSelectionRange(2, 5);
    const workspace = main.innerHTML;
    toggle.click();
    assert.equal(d.w.document.documentElement.classList.contains("compact-nav-collapsed"), true);
    assert.equal(d.css(".shell").gridTemplateColumns, "0px minmax(0, 1fr)");
    assert.equal(sidebar.hasAttribute("inert"), true); assert.equal(sidebar.getAttribute("aria-hidden"), "true");
    assert.equal(toggle.getAttribute("aria-controls"), sidebar.id); assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(toggle.getAttribute("aria-label"), "Show sidebar"); assert.equal(d.css(".compact-rail-toggle").left, "0px");
    assert.equal(main.innerHTML, workspace); assert.equal(d.w.document.activeElement, input); assert.equal(input.selectionStart, 2);
    assert.equal(main.querySelector("iframe"), frame);
    toggle.click();
    assert.equal(d.css(".shell").gridTemplateColumns, "84px minmax(0, 1fr)");
    assert.equal(sidebar.hasAttribute("inert"), false); assert.equal(sidebar.hasAttribute("aria-hidden"), false);
    assert.equal(toggle.getAttribute("aria-expanded"), "true"); assert.equal(toggle.getAttribute("aria-label"), "Hide sidebar");
    assert.equal(input.value, "Unsaved work"); assert.equal(main.querySelector("iframe"), frame);
  } finally { d.dom.window.close(); }
});

test("hidden rail never disables desktop/mobile navigation on resize and remembers the choice only within the page", () => {
  const d = atWidth(940);
  try {
    const { toggle, sidebar, change } = mountToggle(d);
    (sidebar.querySelector(".nav-btn") as HTMLElement).focus(); toggle.click();
    assert.equal(d.w.document.activeElement, toggle, "focus cannot stay in inert navigation");
    change(false);
    assert.equal(sidebar.hasAttribute("inert"), false); assert.equal(sidebar.hasAttribute("aria-hidden"), false);
    assert.equal(d.w.document.documentElement.classList.contains("compact-nav-collapsed"), false);
    assert.equal((toggle as HTMLButtonElement).disabled, true);
    assert.notEqual(d.w.document.activeElement, toggle, "resize must not leave focus on a hidden handle");
    change(true);
    assert.equal(sidebar.hasAttribute("inert"), true); assert.equal(toggle.getAttribute("aria-expanded"), "false");
  } finally { d.dom.window.close(); }
  const fresh = atWidth(940);
  try { assert.equal(mountToggle(fresh).toggle.getAttribute("aria-expanded"), "true", "reload starts with navigation available"); }
  finally { fresh.dom.window.close(); }
});

test("Cases Full Screen never enables the hide/show handle or makes navigation inert", () => {
  const d = atWidth(940);
  try {
    d.w.document.documentElement.classList.add("cases-fullscreen");
    const { toggle, sidebar } = mountToggle(d);
    toggle.click();
    assert.equal((toggle as HTMLButtonElement).disabled, true);
    assert.equal(sidebar.hasAttribute("inert"), false);
    assert.equal(d.w.document.documentElement.classList.contains("compact-nav-collapsed"), false);
  } finally { d.dom.window.close(); }
});
