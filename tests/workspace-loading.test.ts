import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

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
