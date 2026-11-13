import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
const local = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}T${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
async function fixture(query = "") {
  const writes: any[] = [], warnings: string[] = [];
  const vc = new VirtualConsole(); vc.on("jsdomError", error => warnings.push(error.message));
  const dom = new JSDOM(read("public/demo.html"), { runScripts: "outside-only", url: `http://localhost/demo.html${query}`, virtualConsole: vc }), w = dom.window as any;
  w.localStorage.setItem("tax-practice-v2:reminder-user", JSON.stringify({ ui: { currentView: "my-work-view" } }));
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); w.scrollTo = () => {};
  w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.Headers = Headers; w.Response = Response; w.structuredClone = structuredClone;
  let task: any = { id: "saved-reminder", title: "Reminder test", steps: [], reminder: "", createdAt: 1, version: "v1", done: false };
  w.fetch = async (url: string, init: any = {}) => {
    if (url === "/api/my-work" && init.method === "PATCH") {
      const body = JSON.parse(init.body); writes.push(body); task = { ...task, ...body, version: `v${writes.length+1}` };
      return { ok: true, json: async () => ({ task: structuredClone(task) }) };
    }
    const body = url === "/api/profile" ? { user: { id: "reminder-user" }, profile: { id: "pic", role: "supervisor", display_name: "PIC", directory_active: true }, view: "matrix-view" }
      : url === "/api/my-work" ? { tasks: [task] } : { data: [], tasks: [], staff: [], announcements: [] };
    return { ok: true, json: async () => structuredClone(body) };
  };
  for (const file of ["public/vendor/purify.min.js", "public/workspace-sync.js", "public/feature-access.js", "public/annual-sheet-dashboard.js"]) w.eval(read(file));
  await w.eval(read("public/demo.html").match(/<script>([\s\S]*?)<\/script>/)![1]); await tick();
  return { dom, w, writes, warnings, task: () => task };
}

test("reminder links override the remembered bootstrap view and open the accessible task", async () => {
  const d = await fixture("?view=my-work-view&task=saved-reminder");
  try {
    assert.equal(d.w.document.getElementById("my-work-view").classList.contains("hidden"), false);
    assert.ok(d.w.document.querySelector(".my-work-detail")); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("picker and quick reminder times save UTC instants, reopen in local time and can be removed", async () => {
  const d = await fixture("?view=my-work-view&task=saved-reminder");
  try {
    const doc = d.w.document;
    doc.querySelector('[data-open-my-work-menu="reminder"]').click();
    const future = new Date(Date.now()+86400000); future.setHours(9,30,0,0);
    doc.getElementById("my-work-picker").value = local(future);
    doc.querySelector("[data-save-my-work-time]").click(); await tick();
    assert.equal(d.writes.length, 1); assert.equal(d.writes[0].reminder, future.toISOString());
    assert.equal(d.task().done, false);
    doc.querySelector('[data-open-my-work-menu="reminder"]').click();
    assert.equal(doc.getElementById("my-work-picker").value, local(future));
    doc.querySelector("[data-clear-my-work-reminder]").click(); await tick();
    assert.equal(d.writes[1].reminder, "");
    doc.querySelector('[data-open-my-work-menu="reminder"]').click();
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1); tomorrow.setHours(9,0,0,0);
    doc.querySelector('[data-set-my-work-time="tomorrow"]').click(); await tick();
    assert.equal(d.writes[2].reminder, tomorrow.toISOString());
    assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});
