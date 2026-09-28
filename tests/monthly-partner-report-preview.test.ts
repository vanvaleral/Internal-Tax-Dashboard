import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const report = readFileSync(new URL("../public/monthly-partner-report.html", import.meta.url), "utf8");
const demo = readFileSync(new URL("../public/demo.html", import.meta.url), "utf8");

test("Management links to a print-ready report without pretending to finalize live data", () => {
  assert.match(demo, /data-management-tab="report"/);
  assert.match(demo, /href="\.\/monthly-partner-report\.html"/);
  assert.match(report, /@page \{ size:A4 portrait/);
  assert.match(report, /id="finalize" disabled/);
  assert.match(report, /DATA ILUSTRASI/);
});

test("September remains open while October shows the later follow-up", () => {
  const dom = new JSDOM(report, { runScripts: "dangerously" });
  const { document, Event } = dom.window;
  assert.match(document.getElementById("attention-rows")!.textContent!, /Menunggu konfirmasi progres/);
  assert.doesNotMatch(document.getElementById("activities")!.textContent!, /5 Oktober/);
  const period = document.getElementById("period") as HTMLSelectElement;
  period.value = "2026-10";
  period.dispatchEvent(new Event("change"));
  assert.match(document.getElementById("activities")!.textContent!, /5 Oktober/);
  assert.match(document.getElementById("attention-rows")!.textContent!, /carry-over Sep/);
  dom.window.close();
});
