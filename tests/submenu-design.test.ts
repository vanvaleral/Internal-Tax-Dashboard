import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";
import { JSDOM } from "jsdom";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("public/submenu-tabs.css");

test("shared segmented navigation covers every dashboard and annual submenu without hardcoded active colors", () => {
  const sheet = postcss.parse(css);
  for (const name of ["workspace-tabs", "ops-mode-tabs", "my-work-tabs", "view-tabs", "status-tabs", "fullscreen-team-tabs"]) {
    assert.ok(sheet.nodes.some((node: any) => node.type === "rule" && node.selector.includes(`.${name}`)));
  }
  assert.match(css, /background: var\(--submenu-accent\)/);
  assert.match(css, /--submenu-accent: var\(--accent, var\(--cyan/);
  assert.match(css, /--submenu-contrast: var\(--accent-contrast, var\(--sheet-button-ink/);
  assert.match(css, /\.submenu-secondary[\s\S]*background: var\(--submenu-soft\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*overflow-x: auto/);
  assert.doesNotMatch(css, /transition:\s*all|animation:|!important/);
});

test("dashboard and annual sheet load the same stylesheet after existing presentation styles", () => {
  for (const file of ["public/demo.html", "public/annual-accounting-sheet-demo.html"]) {
    const dom = new JSDOM(read(file));
    try {
      const links = [...dom.window.document.querySelectorAll('head link[rel="stylesheet"]')];
      assert.match(links.at(-1)!.getAttribute("href")!, /submenu-tabs\.css$/);
    } finally { dom.window.close(); }
  }
});

test("primary and nested controls have consistent segmented shapes without styling unrelated action buttons", () => {
  const dom = new JSDOM(`<style>${css}</style><div class="ops-mode-tabs"><button class="solid-btn">Monthly</button><button class="ghost-btn">Annual</button></div><div class="workspace-tabs submenu-secondary"><button class="solid-btn">Active</button></div><button id="ordinary-action">Save</button>`);
  try {
    const w = dom.window, doc = w.document;
    assert.equal(w.getComputedStyle(doc.querySelector(".ops-mode-tabs")!).borderRadius, "11px");
    assert.equal(w.getComputedStyle(doc.querySelector(".ops-mode-tabs button")!).borderRadius, "8px");
    assert.equal(w.getComputedStyle(doc.querySelector(".submenu-secondary")!).borderRadius, "9px");
    assert.equal(w.getComputedStyle(doc.querySelector(".submenu-secondary button")!).borderRadius, "6px");
    assert.equal(w.getComputedStyle(doc.querySelector(".ops-mode-tabs button")!).minHeight, "34px");
    assert.equal(w.getComputedStyle(doc.querySelector(".submenu-secondary button")!).minHeight, "30px");
    assert.notEqual(w.getComputedStyle(doc.querySelector("#ordinary-action")!).borderRadius, "8px");
  } finally { dom.window.close(); }
});

test("selected tabs keep their colors while hovered or pressed, including nested and dark annual controls", () => {
  // Model pointer pseudo-states as attributes because jsdom does not render a mouse.
  const pointerStates = (value: string) => value.replace(/:hover\b/g, '[data-hover="true"]').replace(/:active\b/g, '[data-pressed="true"]');
  let rules = pointerStates(css);
  for (const [token, value] of Object.entries({ "--submenu-accent":"#2563eb", "--submenu-contrast":"#ffffff", "--submenu-soft":"#e7f4f3", "--submenu-ink":"#066b77" })) rules = rules.replaceAll(`var(${token})`, value);
  const legacy = pointerStates('button:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.03);background:#fff}.sheet-theme-dark .view-tabs button:hover{background:#fff}');
  for (const [group, marker, nested] of [
    ["workspace-tabs", 'class="solid-btn"', false],
    ["my-work-tabs", 'class="active"', false],
    ["fullscreen-team-tabs", 'aria-current="page"', false],
    ["workspace-tabs", 'class="solid-btn"', true],
    ["view-tabs", 'aria-selected="true"', true],
    ["status-tabs", 'aria-selected="true"', true]
  ] as const) {
    const tag = group === "fullscreen-team-tabs" ? "a" : "button";
    const dom = new JSDOM(`<style>${legacy}</style><style>${rules}</style><div class="sheet-theme-dark"><div class="${group}${nested ? " submenu-secondary" : ""}"><${tag} ${marker}>Selected</${tag}></div></div>`);
    try {
      const w = dom.window, control = w.document.querySelector(tag)!;
      const normal = w.getComputedStyle(control);
      const expected = nested ? "rgb(231, 244, 243)" : "rgb(37, 99, 235)";
      assert.equal(normal.backgroundColor, expected);
      const color = normal.color;
      for (const state of ["data-hover", "data-pressed"]) {
        control.setAttribute(state, "true");
        const active = w.getComputedStyle(control);
        assert.equal(active.backgroundColor, expected, `${group}/${state}`);
        assert.equal(active.color, color, `${group}/${state} text contrast`);
        assert.equal(active.transform, "none"); assert.equal(active.filter, "none");
      }
    } finally { dom.window.close(); }
  }
});

test("Cases tabs use the shared inactive hover highlight and keep their selected color after clicking", () => {
  const pointerStates = (value: string) => value.replace(/:hover\b/g, '[data-hover="true"]').replace(/:active\b/g, '[data-pressed="true"]');
  const legacy = pointerStates(read("public/demo.html").match(/<style>([\s\S]*?)<\/style>/)![1]);
  const rules = pointerStates(css)
    .replaceAll("var(--submenu-accent)", "#2563eb")
    .replaceAll("var(--submenu-contrast)", "#ffffff")
    .replaceAll("color-mix(in srgb, var(--submenu-paper) 75%, transparent)", "#f4f7f6");
  const dom = new JSDOM(`<style>${legacy}</style><style>${rules}</style><div class="workspace-cases"><div class="case-sheet-nav"><div class="workspace-tabs case-mobile-tabs"><button class="solid-btn" aria-pressed="true">Himbauan</button><button id="next" class="ghost-btn" aria-pressed="false">Pemeriksaan</button></div></div></div>`);
  try {
    const w = dom.window, next = w.document.getElementById("next")!;
    next.setAttribute("data-hover", "true");
    assert.equal(w.getComputedStyle(next).backgroundColor, "rgb(244, 247, 246)");
    next.className = "solid-btn"; next.setAttribute("aria-pressed", "true");
    assert.equal(w.getComputedStyle(next).backgroundColor, "rgb(37, 99, 235)");
    assert.equal(w.getComputedStyle(next).color, "rgb(255, 255, 255)");
    next.setAttribute("data-pressed", "true");
    assert.equal(w.getComputedStyle(next).backgroundColor, "rgb(37, 99, 235)");
    assert.equal(w.getComputedStyle(next).transform, "none");
    next.removeAttribute("data-hover"); next.removeAttribute("data-pressed");
    assert.equal(w.getComputedStyle(next).backgroundColor, "rgb(37, 99, 235)");
  } finally { dom.window.close(); }
});

test("embedded, preview and standalone annual controls retain a distinct nested navigation level", () => {
  for (const file of ["public/annual-sheet-dashboard.js", "public/annual-accounting-dashboard-preview.js"]) {
    const source = read(file);
    assert.match(source, /class="toolbar submenu-secondary-row"/);
    assert.match(source, /class="workspace-tabs submenu-secondary"/);
    assert.match(source, /data-annual-team="accounting"/);
    assert.match(source, /data-annual-team="tax"/);
  }
  const dom = new JSDOM(read("public/annual-accounting-sheet-demo.html"));
  try {
    assert.ok(dom.window.document.querySelector(".view-tabs.submenu-secondary"));
    assert.ok(dom.window.document.querySelector(".status-tabs.submenu-secondary"));
    assert.equal(dom.window.document.querySelectorAll(".status-tabs [data-status]").length, 3);
  } finally { dom.window.close(); }
});
