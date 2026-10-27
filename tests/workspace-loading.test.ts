import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("annual loading clips unstyled document overflow, then restores each mode without changing native grid scrolling", () => {
  for (const team of ["accounting", "tax"]) for (const mode of ["standalone", "embedded", "fullscreen"]) {
    const dom = new JSDOM(read("public/annual-accounting-sheet-demo.html"));
    try {
      const w = dom.window, doc = w.document, root = doc.documentElement;
      root.classList.add(`${team}-sheet`);
      if (mode !== "standalone") root.classList.add(`sheet-${mode}`);
      const overflow = (node: Element) => w.getComputedStyle(node).overflow;
      assert.equal(overflow(root), "hidden", `${team}/${mode}: clip before external CSS arrives`);
      assert.equal(overflow(doc.body), "hidden");
      assert.equal(w.getComputedStyle(doc.body).margin, "0px", "default body margins must not create overflow");
      const css = doc.createElement("style"); css.textContent = read("public/annual-accounting-sheet-demo.css"); doc.head.append(css);
      assert.equal(overflow(root), "hidden"); assert.equal(overflow(doc.body), "hidden");
      root.classList.remove("sheet-booting");
      assert.equal(w.getComputedStyle(doc.querySelector(".workbook")!).visibility, "visible");
      if (mode === "fullscreen") {
        assert.equal(overflow(root), "hidden", "full-screen intentionally scrolls inside the sheet");
      } else {
        assert.notEqual(overflow(root), "hidden", "the loading-only document lock must be released");
        assert.notEqual(overflow(doc.body), "hidden");
      }
      assert.equal(overflow(doc.getElementById("grid-scroll")!), "auto", "native grid scrolling remains enabled");
    } finally { dom.window.close(); }
  }
});

test("dashboard and annual first-paint loaders need no image, font, external stylesheet or deferred script", () => {
  for (const [file, id] of [["demo.html", "app-loading-overlay"], ["annual-accounting-sheet-demo.html", "sheet-loading"]]) {
    const html = read(`public/${file}`);
    const dom = new JSDOM(html);
    try {
      const doc = dom.window.document, loader = doc.getElementById(id)!;
      assert.equal(doc.body.firstElementChild, loader);
      assert.equal(loader.hidden, false);
      assert.equal(loader.querySelector("img"), null);
      assert.equal(loader.querySelectorAll(".workspace-bars i").length, 4);
      assert.match(doc.head.textContent!, /prefers-reduced-motion:reduce/);
      assert.equal(doc.querySelector('link[href*="startup-orbit"]'), null);
      const boot = doc.querySelector("script[data-workspace-boot]")!;
      assert.ok(html.indexOf(boot.outerHTML) < html.indexOf('<main class="workbook">') || file === "demo.html");
      assert.match(boot.textContent!, /event\.source === parent/);
      assert.match(boot.textContent!, /event\.origin === location\.origin/);
    } finally { dom.window.close(); }
  }
  const annual = read("public/annual-accounting-sheet-demo.html");
  assert.match(annual, /id="sheet-styles"[^>]*media="print"[^>]*onload=/);
  assert.match(annual, /sheet-booting \.workbook\{visibility:hidden\}/);
  assert.doesNotMatch(read("public/demo.html"), /setTimeout\(finishStartup|classList\.add\("is-entering"\)/);
});

test("shell loader is server-renderable and iframe handover checks origin and source with a late-listener handshake", () => {
  const frame = read("components/demo/demo-frame.tsx");
  assert.match(frame, /useState\(true\)/);
  assert.match(frame, /starting && <WorkspaceLoader/);
  assert.match(frame, /event\.origin !== window\.location\.origin/);
  assert.match(frame, /event\.source !== frame\.current\?\.contentWindow/);
  assert.match(frame, /dashboard:mounted/);
  assert.match(frame, /onLoad=\{requestLoadingStatus\}/);
  assert.match(frame, /workspace:status/);
  assert.match(read("app/loading.tsx"), /<WorkspaceLoader/);
  const loader = read("components/demo/workspace-loader.tsx");
  assert.doesNotMatch(loader, /<img|<link|@import/);
  assert.match(loader, /prefers-reduced-motion:reduce/);
});
