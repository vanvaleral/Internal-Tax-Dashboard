import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import * as rules from "../lib/annual-sheet.ts";
import { scopedWorkspace } from "../lib/workspace-security.ts";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";

const staff = [
  { id: "acc-1", display_name: "Real Acc", full_name: "Real Acc", directory_active: true, team_division: "Accounting Team" },
  { id: "acc-2", display_name: "Other Acc", directory_active: true, team_division: "Accounting Team" },
  { id: "tax-1", display_name: "Real Tax", directory_active: true, team_division: "Tax Team" }
];
const actor = { ...staff[0], role: "staff" };
const raw = () => ({ id: "existing-work", annualWorkId: "11111111-1111-4111-8111-111111111111", clientId: "client-1", clientName: "Actual Client", taxYear: 2025, accountingPic: "Real Acc", accountingPicProfileId: "acc-1", taxPic: "Real Tax", taxPicProfileId: "tax-1", progress: "Data Request", notes: "Old note", technicalAdminMonths: [0, 1], dataMonths: [], reportPreparationMonths: [], paymentAmount: "", ntpe: "-", unknownLegacyField: "preserve me" });
function setup(profile: any = actor) {
  const db = mockDatabase({ staff_profiles: structuredClone(staff), client_master: [{ id: "client-1", legal_name: "Actual Client", status: "Active", accounting_pic_name: "Real Acc", accounting_pic_profile_id: "acc-1", tax_pic_name: "Real Tax", tax_pic_profile_id: "tax-1" }], annual_sheet_columns: [], operational_workspace_state: [{ scope: "annual_accounting", version: 1, payload: [raw()] }], operational_workspace_audit: [] });
  const route = loadRoute("app/api/annual-sheet/route.ts", { "@/lib/access": { currentActor: async () => ({ profile, userId: "auth-user-1", admin: db }), isLeadership: (role: string) => ["supervisor", "partner", "leader", "admin"].includes(role) }, "@/lib/annual-sheet": rules });
  return { db, route };
}

test("annual adapter preserves legacy fields, month flags, payment, dates, IDs and unassigned tax years", () => {
  const legacy = { id: "old-tax", clientName: "Legacy Taxpayer", reportPic: "Real Acc", taxPic: "Real Tax", previousSpt: true, assetReview: true, spt: true, laporCount: "1", kurangBayar: "1.906.990", laporDate: "10/04/2026", ntpe: "BPE-1" };
  const copy = JSON.stringify(legacy), row = rules.annualToSheet(legacy, "tax", staff);
  assert.equal(row.year, 0); assert.equal(row.id, "old-tax"); assert.equal(row.subjectId, "old-tax");
  assert.equal(row.accountingPicId, "acc-1"); assert.equal(row.payableAmount, 1906990); assert.equal(row.filingDate, "2026-04-10");
  assert.deepEqual(row.documents, [0, 2]); assert.deepEqual(row.filing, [0, 2]); assert.equal(row.historicalCompletion, true);
  assert.equal(JSON.stringify(legacy), copy);
  assert.equal(rules.annualToSheet({ ...legacy, kurangBayar: "Nihil" }, "tax", staff).payableAmount, 0);
});

test("initial annual load skips Client Master and lazy generation reads only current active ACC assignments", async () => {
  const { route, db } = setup();
  const calls: string[] = [], from = db.from.bind(db); db.from = table => { calls.push(table); return from(table); };
  const initial = await route.GET(request({}, "?team=accounting&part=sheet"));
  assert.equal(initial.status, 200); assert.equal(initial.body.clients, undefined);
  assert.equal(calls.includes("client_master"), false);
  db.tables.client_master.push({ id: "other", legal_name: "Other client", status: "Active", accounting_pic_profile_id: "acc-2" }, { id: "inactive", legal_name: "Inactive client", status: "Inactive", accounting_pic_profile_id: "acc-1" });
  calls.length = 0;
  const candidates = await route.GET(request({}, "?team=accounting&part=clients"));
  assert.deepEqual(Array.from(candidates.body.clients, (row: any) => row.clientId), ["client-1"]);
  assert.equal(candidates.body.clients[0].accountingPicId, "acc-1");
  assert.deepEqual(calls, ["client_master"]);
  const legacy = await route.GET(request({}, "?team=accounting"));
  assert.equal(legacy.body.clients.length, 1, "older open tabs must retain their legacy initial candidates until reloaded");
});

async function openRefreshFixture() {
  const { route, db } = setup();
  const dom = new JSDOM(readFileSync(new URL("../public/annual-accounting-sheet-demo.html", import.meta.url), "utf8"), { runScripts: "outside-only", url: "http://localhost/annual-accounting-sheet-demo.html?live=1&account=auth-user-1" });
  const w = dom.window as any;
  w.matchMedia = () => ({ matches: false }); w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  Object.defineProperty(w.document, "hidden", { value: false });
  let clock = 1000000, holdRead = false, releaseRead: (() => void) | undefined, failure = 0;
  w.Date.now = () => clock;
  const requests: string[] = [];
  w.fetch = async (url: string, options: any) => {
    requests.push(`${options.method} ${url}`);
    const result = options.method === "POST" ? await route.POST(request(JSON.parse(options.body))) : await route.GET(request({}, new URL(url, "http://localhost").search));
    // Deliberately ignore AbortSignal to test the stale-response fence as well as cancellation.
    if (options.method === "GET" && !url.includes("part=clients") && holdRead) { holdRead = false; await new Promise<void>(resolve => { releaseRead = resolve; }); }
    if (options.method === "GET" && failure) return { ok: false, status: failure, json: async () => ({ error: "Refresh failed" }) };
    return { ok: result.status < 400, status: result.status, json: async () => structuredClone(result.body) };
  };
  w.eval(readFileSync(new URL("../public/annual-sheet-live.js", import.meta.url), "utf8"));
  w.eval(readFileSync(new URL("../public/annual-accounting-sheet-demo.js", import.meta.url), "utf8"));
  const tick = () => new Promise<void>(resolve => setImmediate(resolve));
  await tick();
  const api = w.AnnualSheetDemo, notes = api.columns.findIndex((col: any) => col.field === "notes");
  const cell = () => w.document.querySelector(`td[data-r="0"][data-c="${notes}"]`);
  const choose = () => { cell().dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, button: 0 })); w.document.dispatchEvent(new w.MouseEvent("pointerup", { bubbles: true })); };
  return { dom, w, db, api, tick, cell, choose, requests,
    advance() { clock += 31000; }, hold() { holdRead = true; }, release() { releaseRead!(); }, fail(status: number) { failure = status; },
    focus() { w.dispatchEvent(new w.Event("focus")); w.document.dispatchEvent(new w.Event("visibilitychange")); }
  };
}

test("tab refresh is throttled, never locks confirmed cells and leaves unchanged grid DOM intact", async () => {
  const d = await openRefreshFixture();
  try {
    const originalCell = d.cell();
    d.focus(); d.focus(); await d.tick();
    assert.equal(d.requests.length, 1);
    d.advance(); d.hold(); d.focus(); d.focus(); await d.tick();
    assert.equal(d.requests.length, 2);
    assert.equal(d.api.canEdit(d.api.visible[0], d.api.columns.find((col: any) => col.field === "notes")), true);
    assert.equal(d.cell(), originalCell);
    d.release(); await d.tick();
    assert.equal(d.cell(), originalCell, "unchanged background reads should not rebuild the table");
  } finally { d.dom.window.close(); }
});

test("changed background reads wait for typing to finish and never replace the active editor", async () => {
  const d = await openRefreshFixture();
  try {
    d.db.tables.operational_workspace_state[0].payload[0].notes = "Remote note";
    d.advance(); d.hold(); d.focus(); await d.tick();
    d.choose(); d.cell().dispatchEvent(new d.w.MouseEvent("dblclick", { bubbles: true }));
    const input = d.cell().querySelector("input"); input.value = "Still typing";
    d.release(); await d.tick();
    assert.equal(d.cell().querySelector("input"), input); assert.equal(input.value, "Still typing");
    assert.equal(d.api.visible[0].notes, "Old note");
    input.dispatchEvent(new d.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    d.cell().dispatchEvent(new d.w.KeyboardEvent("keyup", { key: "Escape", bubbles: true })); await d.tick();
    assert.equal(d.api.visible[0].notes, "Remote note");
  } finally { d.dom.window.close(); }
});

test("a late pre-save read cannot overwrite the confirmed UI or transport state", async () => {
  const d = await openRefreshFixture();
  try {
    d.advance(); d.hold(); d.focus(); await d.tick(); d.choose();
    const paste = new d.w.Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { getData: () => "Newest saved note" } });
    d.w.document.getElementById("annual-grid").dispatchEvent(paste); await d.tick();
    assert.equal(d.api.visible[0].notes, "Newest saved note");
    d.release(); await d.tick();
    assert.equal(d.api.visible[0].notes, "Newest saved note");
    assert.equal(d.w.AnnualSheetLive.context.rows[0].notes, "Newest saved note");
  } finally { d.dom.window.close(); }
});

test("generation lazy-loads Client Master and resolves uppercase PIC labels by profile ID", async () => {
  const d = await openRefreshFixture();
  try {
    assert.equal(d.requests.some(url => url.includes("part=clients")), false);
    d.db.tables.client_master[0].accounting_pic_name = "REAL ACC";
    const year = d.w.document.getElementById("year-select"); year.value = "2026"; year.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    d.w.document.getElementById("generate-button").click(); await d.tick();
    assert.equal(d.requests.filter(url => url.includes("part=clients")).length, 1);
    assert.equal(d.w.document.querySelectorAll("#candidate-list input:not(:disabled)").length, 1);
    d.w.document.getElementById("confirm-generate").click(); await d.tick();
    assert.equal(d.api.visible.length, 1); assert.equal(d.api.visible[0].year, 2026); assert.equal(d.api.visible[0].accountingPic, "Real Acc");
  } finally { d.dom.window.close(); }
});

test("temporary read failures keep confirmed rows usable but access errors clear the sheet", async () => {
  const d = await openRefreshFixture();
  try {
    d.fail(503); d.advance(); d.focus(); await d.tick();
    assert.equal(d.api.visible.length, 1);
    assert.equal(d.api.canEdit(d.api.visible[0], d.api.columns.find((col: any) => col.field === "notes")), true);
    d.fail(403); d.advance(); d.focus(); await d.tick();
    assert.equal(d.api.visible.length, 0); assert.equal(d.w.AnnualSheetLive.context, null);
    assert.equal(d.w.document.getElementById("sheet-loading").hidden, false);
  } finally { d.dom.window.close(); }
});

test("both annual teams delete through primary-PIC checked soft deletion and restore without losing history", async () => {
  for (const team of ["accounting", "tax"] as const) {
    const profile = team === "tax" ? { ...staff[2], role: "staff" } : actor;
    const { route, db } = setup(profile);
    db.tables.operational_workspace_state[0].scope = rules.annualScope(team);
    const clients = JSON.stringify(db.tables.client_master), stored = JSON.stringify(db.tables.operational_workspace_state[0].payload[0]);
    const first = await route.GET(request({}, `?team=${team}`)), row = first.body.rows[0];
    const deleted = await route.POST(request({ team, action: "archive-row", rowId: row.id, before: row }));
    assert.equal(deleted.status, 200);
    const rawRow = db.tables.operational_workspace_state[0].payload[0];
    assert.ok(rawRow.deletedAt); assert.equal(rawRow.deletedByProfileId, profile.id);
    assert.equal(rawRow.changeLog[0].action, "annual_row_deleted");
    assert.equal(rawRow.unknownLegacyField, "preserve me");
    assert.equal(JSON.stringify(db.tables.client_master), clients);
    for (const leader of [true, false]) assert.equal(scopedWorkspace(rules.annualScope(team), [rawRow], new Set(["client-1"]), profile.id, leader).length, 0);
    assert.equal((await route.POST(request({ team, action: "commit", creates: [], edits: [{ id: row.id, changes: { notes: "Cannot edit trash" }, before: { notes: "Old note" } }] }))).status, 400);
    const restored = await route.POST(request({ team, action: "restore-row", rowId: row.id, before: deleted.body.rows[0] }));
    assert.equal(restored.status, 200); assert.equal(restored.body.rows[0].deletedAt, "");
    const { deletedAt, deletedByProfileId, changeLog, ...retained } = db.tables.operational_workspace_state[0].payload[0];
    assert.equal(JSON.stringify(retained), stored);
    assert.deepEqual(changeLog.map((event: any) => event.action), ["annual_row_deleted", "annual_row_restored"]);
  }
});

test("annual deletion rejects other-team PICs, assistants and stale snapshots, with retry protection for unrelated writes", async () => {
  const { route, db } = setup();
  const before = (await route.GET(request({}, "?team=accounting"))).body.rows[0];
  const body = { team: "accounting", action: "archive-row", rowId: before.id, before };
  db.tables.operational_workspace_state[0].payload[0].notes = "Newer note";
  assert.equal((await route.POST(request(body))).status, 409);
  assert.equal(db.tables.operational_workspace_state[0].payload[0].deletedAt, undefined);
  const wrongTeam = setup({ ...staff[2], role: "staff" });
  assert.equal((await wrongTeam.route.POST(request(body))).status, 403);
  const assistant = setup({ ...staff[1], role: "staff" });
  assistant.db.tables.operational_workspace_state[0].payload[0].assistantProfileIds = ["acc-2"];
  const assistedRow = (await assistant.route.GET(request({}, "?team=accounting"))).body.rows[0];
  assert.equal(assistedRow.canManageRow, false);
  assert.equal((await assistant.route.POST(request({ ...body, before: assistedRow }))).status, 403);
  body.before = (await route.GET(request({}, "?team=accounting"))).body.rows[0];
  db.beforeWrite = () => { const workspace = db.tables.operational_workspace_state[0]; workspace.version++; workspace.payload.push({ ...raw(), id: "other-work", annualWorkId: "99999999-9999-4999-8999-999999999999", clientId: "other-client", accountingPicProfileId: "acc-2" }); };
  assert.equal((await route.POST(request(body))).status, 200);
  assert.equal(db.tables.operational_workspace_state[0].payload[1].deletedAt, undefined);
});

test("deleted annual clients can be generated again, and restoring an active client-year duplicate is blocked", async () => {
  const { route, db } = setup();
  const before = (await route.GET(request({}, "?team=accounting"))).body.rows[0];
  const deleted = await route.POST(request({ team: "accounting", action: "archive-row", rowId: before.id, before }));
  assert.equal(deleted.status, 200);
  const generated = await route.POST(request({ team: "accounting", action: "commit", edits: [], creates: [{ id: "22222222-2222-4222-8222-222222222222", clientId: "client-1", clientName: "Actual Client", year: 2025, notes: "" }] }));
  assert.equal(generated.status, 200); assert.equal(db.tables.operational_workspace_state[0].payload.length, 2);
  assert.equal((await route.POST(request({ team: "accounting", action: "restore-row", rowId: before.id, before: deleted.body.rows[0] }))).status, 409);
  assert.equal(db.tables.operational_workspace_state[0].payload.filter((row: any) => !row.deletedAt).length, 1);
});

test("annual field API enforces primary-team PIC, locks assignment edits and rejects unknown fields", async () => {
  const own = setup(), body = { action: "commit", team: "accounting", creates: [], edits: [{ id: "existing-work", changes: { notes: "Updated" }, before: { notes: "Old note" } }] };
  assert.equal((await own.route.POST(request(body))).status, 200);
  assert.equal(own.db.tables.operational_workspace_state[0].payload[0].unknownLegacyField, "preserve me");
  const wrongTeam = setup({ ...staff[2], role: "staff" });
  assert.equal((await wrongTeam.route.POST(request(body))).status, 403);
  const assignment = setup();
  assert.equal((await assignment.route.POST(request({ ...body, edits: [{ id: "existing-work", changes: { accountingPic: "Other Acc" }, before: { accountingPic: "Real Acc" } }] }))).status, 403);
  assert.equal((await assignment.route.POST(request({ ...body, edits: [{ id: "existing-work", changes: { assistantProfileIds: ["acc-2"] }, before: {} }] }))).status, 400);
});

test("annual batch is atomic, checks same-field conflicts, and retries unrelated concurrent writes safely", async () => {
  const { route, db } = setup();
  db.tables.operational_workspace_state[0].payload.push({ ...raw(), id: "other-work", annualWorkId: "99999999-9999-4999-8999-999999999999", clientId: "other-client", accountingPicProfileId: "acc-2", notes: "Other PIC private note" });
  const body = { action: "commit", team: "accounting", creates: [], edits: [{ id: "existing-work", changes: { notes: "Saved note" }, before: { notes: "Old note" } }] };
  db.beforeWrite = () => { const current = db.tables.operational_workspace_state[0]; current.version++; current.payload[0].deadline = "2026-04-20"; };
  assert.equal((await route.POST(request(body))).status, 200);
  assert.equal(db.tables.operational_workspace_state[0].payload[0].deadline, "2026-04-20");
  assert.equal(db.tables.operational_workspace_state[0].payload[0].notes, "Saved note");
  assert.equal(db.tables.operational_workspace_state[0].payload[1].notes, "Other PIC private note");
  const version = db.tables.operational_workspace_state[0].version;
  assert.equal((await route.POST(request(body))).status, 409);
  assert.equal(db.tables.operational_workspace_state[0].version, version);
  const badBatch = { ...body, edits: [{ id: "existing-work", changes: { notes: "Must not save" }, before: { notes: "Saved note" } }, { id: "missing", changes: { notes: "Invalid" }, before: {} }] };
  assert.equal((await route.POST(request(badBatch))).status, 403);
  assert.equal(db.tables.operational_workspace_state[0].payload[0].notes, "Saved note");
});

test("shared column definitions are leadership-only and persist with typed per-row values", async () => {
  const staffSession = setup();
  assert.equal((await staffSession.route.POST(request({ team: "accounting", action: "add-column", title: "Review date", type: "date" }))).status, 403);
  const { route, db } = setup({ ...actor, role: "supervisor" });
  const added = await route.POST(request({ team: "accounting", action: "add-column", title: "Review date", type: "date" }));
  assert.equal(added.status, 200); assert.equal(added.body.columns.length, 1);
  const field = added.body.columns[0].field;
  assert.match(field, /^custom_[a-f0-9]{32}$/);
  const result = await route.POST(request({ team: "accounting", action: "commit", creates: [], edits: [{ id: "existing-work", changes: { [field]: "2026-10-26" }, before: { [field]: "" } }] }));
  assert.equal(result.status, 200); assert.equal(db.tables.operational_workspace_state[0].payload[0].sheetValues[field], "2026-10-26");
  const loaded = await route.GET(request({}, "?team=accounting"));
  assert.equal(loaded.body.rows[0][field], "2026-10-26");
});

test("annual tax subjects remain independent and completion requires real filing/payment evidence", async () => {
  const profile = { ...staff[2], role: "staff" }, { route, db } = setup(profile);
  const id = "77777777-7777-4777-8777-777777777777";
  const created = await route.POST(request({ action: "commit", team: "tax", edits: [], creates: [{ id, clientName: "Director Name", year: 2025, subjectType: "Individual", groupName: "Actual Client", notes: "" }] }));
  assert.equal(created.status, 200);
  const row = created.body.rows[0]; assert.equal(row.clientId, ""); assert.equal(row.taxPicId, "tax-1");
  const save = (changes: any, before: any) => route.POST(request({ action: "commit", team: "tax", creates: [], edits: [{ id, changes, before }] }));
  assert.equal((await save({ progress: "Done" }, { progress: "Data Request" })).status, 400);
  const completed = await save({ progress: "Done", filing: [0, 2], filingDate: "2026-03-20", ntpe: "00022-BPE", payableAmount: 0 }, { progress: "Data Request", filing: [], filingDate: "", ntpe: "", payableAmount: "" });
  assert.equal(completed.status, 200);
  assert.equal(db.tables.operational_workspace_state.find((item: any) => item.scope === "annual_tax").payload[0].reported, true);
  assert.equal(db.tables.client_master.length, 1);
});

test("production dashboard keeps live frames stable, ignores untrusted messages and never changes account roles", () => {
  const dom = new JSDOM('<main class="main"><div id="matrix-view"></div></main>', { runScripts: "outside-only", url: "http://localhost/demo.html" });
  const w = dom.window as any;
  try {
    w.eval(readFileSync(new URL("../public/annual-sheet-dashboard.js", import.meta.url), "utf8"));
    const api = w.AnnualDashboardSheets, root = w.document.getElementById("matrix-view");
    let saves = 0; api.configure(() => saves++);
    const state = { currentView: "matrix-view", operationsMode: "annual", annualTeam: "accounting", role: "staff" };
    api.render(root, state);
    const frame = w.document.querySelector("iframe"); assert.match(frame.src, /embedded=1&live=1$/);
    api.syncVisibility({ ...state, currentView: "my-work-view" }); assert.equal(frame.parentElement.hidden, true);
    api.render(root, state); assert.equal(w.document.querySelector("iframe"), frame);
    const data = { type: "annual-sheet:state", team: "accounting", saved: true, actorId: "supervisor-demo" };
    w.dispatchEvent(new w.MessageEvent("message", { origin: "http://evil.example", source: frame.contentWindow, data }));
    w.dispatchEvent(new w.MessageEvent("message", { origin: "http://localhost", source: w, data }));
    assert.equal(saves, 0);
    w.dispatchEvent(new w.MessageEvent("message", { origin: "http://localhost", source: frame.contentWindow, data }));
    assert.equal(saves, 1); assert.equal(state.role, "staff");
    api.render(root, { ...state, annualTeam: "tax" });
    assert.equal(w.document.querySelectorAll("iframe").length, 2);
    assert.equal(frame.parentElement.hidden, true);
  } finally { dom.window.close(); }
});

test("annual NTPE auto-completion and clearing are audited atomically, with no fabricated controls", async () => {
  const { route, db } = setup();
  const save = (changes: any, before: any) => route.POST(request({ action: "commit", team: "accounting", creates: [], edits: [{ id: "existing-work", changes, before }] }));
  const saved = await save({ ntpe: "0001-BPE", paymentValue: 0 }, { ntpe: "", paymentValue: "", progress: "Data Request" });
  assert.equal(saved.status, 200);
  let row = db.tables.operational_workspace_state[0].payload[0];
  assert.equal(row.progress, "Done"); assert.equal(row.paymentAmount, 0); assert.deepEqual(row.technicalAdminMonths, [0, 1]);
  assert.ok(row.changeLog[0].before); assert.equal(row.changeLog[0].byProfileId, "acc-1");
  assert.equal((await save({ progress: "In Process", dataMonths: Array.from({ length: 12 }, (_, i) => i) }, { progress: "Done", dataMonths: [] })).status, 400);
  assert.equal((await save({ ntpe: "" }, { ntpe: "0001-BPE", progress: "Done" })).status, 200);
  row = db.tables.operational_workspace_state[0].payload[0]; assert.equal(row.progress, "Data Request"); assert.equal(row.changeLog.length, 2);
  db.tables.operational_workspace_state[0].payload.push({ ...raw(), id: "legacy-proof", annualWorkId: "88888888-8888-4888-8888-888888888888", clientId: "legacy-client", ntpe: "OLD-BPE", progress: "Review" });
  const clearedLegacy = await route.POST(request({ action: "commit", team: "accounting", creates: [], edits: [{ id: "legacy-proof", changes: { ntpe: "" }, before: { ntpe: "OLD-BPE", progress: "Review" } }] }));
  assert.equal(clearedLegacy.status, 200);
  assert.equal(db.tables.operational_workspace_state[0].payload[1].progress, "Review", "do not invent a previous stage for legacy proofs");
});

test("annual generation rechecks active Client Master ownership, preserves years, and outside work never changes allocations", async () => {
  const { route, db } = setup();
  const create = { id: "22222222-2222-4222-8222-222222222222", year: 2026, clientId: "client-1", clientName: "Tampered", notes: "" };
  const body = { action: "commit", team: "accounting", edits: [], creates: [create] };
  assert.equal((await route.POST(request(body))).status, 200);
  assert.equal((await route.POST(request(body))).status, 200);
  assert.equal(db.tables.operational_workspace_state[0].payload.length, 2);
  assert.equal(db.tables.operational_workspace_state[0].payload[1].clientName, "Actual Client");
  assert.equal(db.tables.operational_workspace_state[0].payload[1].accountingPicProfileId, "acc-1");
  db.tables.client_master[0].accounting_pic_profile_id = "acc-2";
  assert.equal((await route.POST(request({ ...body, creates: [{ ...create, id: "33333333-3333-4333-8333-333333333333", year: 2027 }] }))).status, 403);
  const clientCopy = JSON.stringify(db.tables.client_master);
  assert.equal((await route.POST(request({ ...body, creates: [{ ...create, id: "44444444-4444-4444-8444-444444444444", clientId: "", clientName: "Outside entity" }] }))).status, 200);
  assert.equal(JSON.stringify(db.tables.client_master), clientCopy);
});

test("live sheet never seeds samples, uses authenticated roster and waits for database confirmation", async () => {
  const { route, db } = setup();
  const html = readFileSync(new URL("../public/annual-accounting-sheet-demo.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/annual-accounting-sheet-demo.html?live=1&embedded=1&account=auth-user-1" });
  const w = dom.window as any;
  w.matchMedia = () => ({ matches: false }); w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  let release: (() => void) | undefined, fail = false;
  w.fetch = async (_url: string, options: any) => {
    assert.equal(options.headers["x-workspace-user"], "auth-user-1");
    if (options.method === "POST") {
      await new Promise<void>(resolve => { release = resolve; });
      if (fail) return { ok: false, json: async () => ({ error: "Database unavailable" }) };
    }
    const result = options.method === "POST" ? await route.POST(request(JSON.parse(options.body))) : await route.GET(request({}, "?team=accounting"));
    return { ok: result.status < 400, json: async () => structuredClone(result.body) };
  };
  try {
    w.eval(readFileSync(new URL("../public/annual-sheet-live.js", import.meta.url), "utf8"));
    w.eval(readFileSync(new URL("../public/annual-accounting-sheet-demo.js", import.meta.url), "utf8"));
    const api = w.AnnualSheetDemo;
    assert.equal(api.state.rows.length, 0, "no demo records while loading");
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(api.state.rows.length, 1); assert.equal(api.state.actorId, "acc-1");
    const fullScreenUrl = new URL(w.document.getElementById("fullscreen-button").href);
    assert.equal(fullScreenUrl.searchParams.get("live"), "1");
    assert.equal(fullScreenUrl.searchParams.get("account"), "auth-user-1");
    assert.equal(fullScreenUrl.searchParams.has("embedded"), false);
    assert.equal(w.document.querySelector(".access-toolbar").hidden, true);
    assert.equal(api.state.rows[0].clientName, "Actual Client");
    const notes = api.columns.findIndex((col: any) => col.field === "notes");
    const paste = (value: string) => {
      const cell = w.document.querySelector(`td[data-r="0"][data-c="${notes}"]`);
      cell.dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, button: 0 }));
      w.document.dispatchEvent(new w.MouseEvent("pointerup", { bubbles: true }));
      const event = new w.Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: { getData: () => value } });
      w.document.getElementById("annual-grid").dispatchEvent(event);
    };
    paste("Confirmed note");
    assert.equal(api.state.rows[0].notes, "Old note", "pending changes must not masquerade as saved");
    const pendingNavigation = new w.MouseEvent("click", { bubbles: true, cancelable: true });
    w.document.getElementById("fullscreen-button").dispatchEvent(pendingNavigation);
    assert.equal(pendingNavigation.defaultPrevented, true, "new-tab navigation must wait for database confirmation");
    release!(); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(api.state.rows[0].notes, "Confirmed note");
    assert.equal(db.tables.operational_workspace_state[0].payload[0].notes, "Confirmed note");
    w.document.getElementById("undo-button").click(); release!(); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(api.state.rows[0].notes, "Old note");
    assert.equal(db.tables.operational_workspace_state[0].payload[0].notes, "Old note");
    w.document.getElementById("redo-button").click(); release!(); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(api.state.rows[0].notes, "Confirmed note");
    fail = true; paste("Not persisted"); release!(); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(api.state.rows[0].notes, "Confirmed note");
    assert.match(w.document.getElementById("save-status").textContent, /Save not confirmed/);
    assert.equal(w.document.getElementById("pic-progress-content").hidden, true);
    fail = false;
    w.document.querySelector("[data-row-actions]").click(); w.document.getElementById("manage-row-button").click();
    assert.equal(w.document.getElementById("delete-row-dialog").open, true);
    w.document.getElementById("confirm-delete-row").click();
    assert.equal(api.visible.length, 1, "row deletion must wait for database confirmation");
    release!(); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(api.visible.length, 0); assert.equal(w.document.getElementById("deleted-count").textContent, "1");
    assert.equal(db.tables.operational_workspace_state[0].payload.length, 1, "the database record must be preserved");
    w.document.querySelector('[data-status="deleted"]').click();
    w.document.querySelector("[data-row-actions]").click(); w.document.getElementById("manage-row-button").click();
    assert.equal(api.visible.length, 1, "restore also waits for confirmation");
    release!(); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(w.document.getElementById("deleted-count").textContent, "0");
    assert.equal(db.tables.operational_workspace_state[0].payload[0].deletedAt, "");
  } finally { dom.window.close(); }
});
