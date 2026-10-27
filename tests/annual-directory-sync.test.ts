import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("PIC Access roster changes notify annual frames and full-screen tabs once without broadcasting directory data", () => {
  const source = read("public/demo.html");
  const notify = source.match(/    function notifyAnnualDirectoryChanged\(staff\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(notify);
  assert.match(source, /staffDirectoryLoaded = true;\s*notifyAnnualDirectoryChanged\(staff\)/);
  assert.ok(/staffDirectory = Array\.isArray\(result\.staff\) \? result\.staff : \[\];\s*syncOperationalPicLists\(staffDirectory\);\s*notifyAnnualDirectoryChanged\(staffDirectory\)/.test(source));
  const dom = new JSDOM("", { runScripts: "outside-only", url: "http://localhost/demo.html" });
  const w = dom.window as any, frames: string[] = [], messages: any[] = [];
  w.AnnualDashboardSheets = { directoryChanged: (token: string) => frames.push(token) };
  w.BroadcastChannel = class { constructor(name: string) { assert.equal(name, "tax-dashboard:staff-directory"); } postMessage(data: any) { messages.push(data); } };
  try {
    w.eval(`let annualDirectorySignature = "", annualDirectoryChannel; const IS_OFFLINE_DEMO = false; ${notify}; window.notifyDirectory = notifyAnnualDirectoryChanged;`);
    const staff: any[] = [{ id: "acc-1", display_name: "Private staff name", team_division: "Accounting Team", role: "staff", directory_active: true }];
    w.notifyDirectory(staff); w.notifyDirectory(staff); assert.equal(frames.length, 1); assert.equal(messages.length, 1);
    staff[0].team_division = "Tax Team"; w.notifyDirectory(staff);
    staff[0].directory_active = false; w.notifyDirectory(staff);
    staff[0].display_name = "Changed staff name"; w.notifyDirectory(staff);
    assert.equal(frames.length, 4);
    assert.deepEqual(Object.keys(messages[0]).sort(), ["token", "type"]);
    assert.equal(messages[0].type, "staff-directory:changed");
    assert.equal(JSON.stringify(messages).includes("Private staff name"), false);
  } finally { w.close(); }
});

test("PIC Access and ordinary directory loads rebuild the same active operational lists", () => {
  const source = read("public/demo.html");
  const sync = source.match(/    function syncOperationalPicLists\(staff\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(sync);
  assert.match(source, /syncOperationalPicLists\(staff\);/);
  assert.match(source, /staffDirectory = Array\.isArray\(result\.staff\) \? result\.staff : \[\];\s*syncOperationalPicLists\(staffDirectory\)/);
  const run = new Function("staff", `let ACC_PICS,TAX_PICS,ALL_PICS,PARTNERS,SUPERVISORS; ${sync}; syncOperationalPicLists(staff); return {ACC_PICS,TAX_PICS,ALL_PICS,PARTNERS};`);
  const result = run([
    { id: "a", display_name: "Current ACC", team_division: "Accounting Team", role: "staff", directory_active: true },
    { id: "b", display_name: "Archived ACC", team_division: "Accounting Team", role: "staff", directory_active: false },
    { id: "c", display_name: "Tax Leader", team_division: "Tax Team", role: "leader", directory_active: true },
    { id: "d", display_name: "Partner", team_division: "Accounting Team", role: "partner", directory_active: true }
  ]);
  assert.deepEqual(result.ACC_PICS, ["Current ACC"]); assert.deepEqual(result.TAX_PICS, ["Tax Leader"]);
  assert.deepEqual(result.ALL_PICS, ["Current ACC", "Tax Leader"]); assert.deepEqual(result.PARTNERS, ["Partner"]);
});

test("confirmed PIC Access changes invalidate old directory reads even if the follow-up reload fails", async () => {
  const source = read("public/demo.html");
  const accept = source.match(/    function acceptStaffAccessChange\(change\) \{[\s\S]*?\n    \}/)?.[0];
  const load = source.match(/    async function loadStaffAccessDirectory\(\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(accept); assert.ok(load);
  assert.ok(/if \(!response.ok\) throw new Error\(result.error \|\| "Staff access could not be saved\."\);\s*acceptStaffAccessChange\(result.staff\)/.test(source));
  let release: ((response: any) => void) | undefined, calls = 0, failed = false;
  const notices: any[] = [], alerts: any[] = [];
  const fetch = async () => {
    calls++;
    if (calls === 1) return new Promise(resolve => { release = resolve; });
    return { ok: !failed, json: async () => failed ? { error: "Follow-up read failed" } : { staff: [{ id: "a", display_name: "Saved name", directory_active: true }] } };
  };
  const run = new Function("appFetch", "notifyAnnualDirectoryChanged", "window", "console", `let staffDirectory = [{id:"a",display_name:"Old name"}],staffDirectoryRevision=0; const syncOperationalPicLists=()=>{},rerender=()=>{}; ${accept}; ${load}; return {accept:acceptStaffAccessChange,load:loadStaffAccessDirectory,get rows(){return staffDirectory;}};`);
  const directory = run(fetch, (rows: any[]) => notices.push(structuredClone(rows)), { alert: (error: any) => alerts.push(error) }, { warn() {} });
  const oldRead = directory.load();
  directory.accept({ id: "a", display_name: "Saved name", directory_active: true });
  await directory.load();
  release!({ ok: true, json: async () => ({ staff: [{ id: "a", display_name: "Old name" }] }) }); await oldRead;
  assert.equal(directory.rows[0].display_name, "Saved name");
  directory.accept({ id: "a", directory_active: false }); failed = true; await directory.load();
  assert.equal(directory.rows[0].directory_active, false);
  assert.equal(notices.at(-1)[0].directory_active, false, "annual views were notified before the failed reload");
  assert.equal(alerts.length, 1);
});

test("annual parent retains dirty directory notices until each stable frame is ready and visible", () => {
  const dom = new JSDOM('<main class="main"><div id="matrix-view"></div></main>', { runScripts: "outside-only", url: "http://localhost/demo.html" });
  const w = dom.window as any;
  try {
    w.eval(read("public/annual-sheet-dashboard.js"));
    const api = w.AnnualDashboardSheets, root = w.document.getElementById("matrix-view");
    const state = { currentView: "matrix-view", operationsMode: "annual", annualTeam: "accounting" };
    api.render(root, state);
    const acc = w.document.querySelector("iframe"), accMessages: any[] = [], taxMessages: any[] = [];
    acc.contentWindow.postMessage = (message: any) => { if (message.type === "annual-sheet:directory-changed") accMessages.push(message); };
    api.directoryChanged("before-ready"); assert.equal(accMessages.length, 0);
    const ready = (frame: any, team: string) => w.dispatchEvent(new w.MessageEvent("message", { origin: "http://localhost", source: frame.contentWindow, data: { type: "annual-sheet:state", team } }));
    ready(acc, "accounting"); assert.equal(accMessages[0].token, "before-ready");
    api.render(root, { ...state, annualTeam: "tax" });
    const tax = w.document.querySelectorAll("iframe")[1]; tax.contentWindow.postMessage = (message: any) => { if (message.type === "annual-sheet:directory-changed") taxMessages.push(message); }; ready(tax, "tax");
    api.directoryChanged("directory-change"); assert.equal(taxMessages.at(-1).token, "directory-change");
    assert.equal(accMessages.length, 1, "hidden frames need not refetch immediately");
    api.syncVisibility(state);
    assert.equal(accMessages.at(-1).type, "annual-sheet:directory-changed"); assert.equal(accMessages.at(-1).token, "directory-change");
    assert.equal(w.document.querySelectorAll("iframe").length, 2);
    assert.equal(w.document.querySelector("iframe"), acc, "do not reload the iframe or show another startup loader");
  } finally { w.close(); }
});
