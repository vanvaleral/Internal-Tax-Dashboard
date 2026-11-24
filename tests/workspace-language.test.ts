import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

test("language is remembered, localizes new controls, and leaves records and input values alone", async () => {
  const dom = new JSDOM(`<html lang="en"><body>
    <button data-workspace-language="en">EN</button><button data-workspace-language="id">ID</button>
    <button data-client-tab="active">Active Clients</button>
    <button class="client-link">Active Clients</button>
    <input id="active-client-search" placeholder="Search name, PIC, NPWP..." value="Clients">
    <main id="dashboard-view"></main></body></html>`, { url: "https://dashboard.invalid", runScripts: "outside-only" });
  const w = dom.window;
  const script = readFileSync(new URL("../public/workspace-language.js", import.meta.url), "utf8");
  try {
    w.eval(script);
    const q = (selector: string) => w.document.querySelector(selector)!;
    (q('[data-workspace-language="id"]') as HTMLButtonElement).click();
    assert.equal(w.document.documentElement.lang, "id");
    assert.equal(q("[data-client-tab]").textContent, "Klien Aktif");
    assert.equal(q(".client-link").textContent, "Active Clients");
    assert.equal((q("input") as HTMLInputElement).value, "Clients");
    assert.equal(q("input").getAttribute("placeholder"), "Cari nama, PIC, NPWP...");
    q("main").innerHTML = '<button data-management-tab="overview">KPI Overview</button><div class="section-title"><h3>Team Performance Board</h3></div><table><thead><tr><th>Client</th><th><button>Monthly Done</button></th></tr></thead><tbody><tr><td>Client</td><td>Monthly Done</td></tr></tbody></table>';
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(q("[data-management-tab]").textContent, "Ringkasan KPI");
    assert.equal(q("h3").textContent, "Ringkasan Kinerja Tim");
    assert.equal(q("th").textContent, "Klien");
    assert.equal(q("th button").textContent, "Bulanan Selesai");
    assert.equal(q("td").textContent, "Client");
    assert.equal(w.localStorage.getItem("tax-dashboard:language"), "id");
    (q('[data-workspace-language="en"]') as HTMLButtonElement).click();
    assert.equal(q("[data-management-tab]").textContent, "KPI Overview");
    assert.equal(q("th button").textContent, "Monthly Done");
    assert.equal(q("[data-client-tab]").textContent, "Active Clients");
  } finally { w.close(); }
});

test("annual sheets translate short descriptions, keep option values stable, and follow changes from another tab", async () => {
  const html = readFileSync(new URL("../public/annual-accounting-sheet-demo.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../public/workspace-language.js", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "https://dashboard.invalid/annual-accounting-sheet-demo.html?team=tax", runScripts: "outside-only" });
  const w = dom.window;
  try {
    w.localStorage.setItem("tax-dashboard:language", "id");
    w.eval(script);
    const q = (selector: string) => w.document.querySelector(selector)!;
    const type = q('select[name="subjectType"]') as HTMLSelectElement;
    assert.equal(w.document.documentElement.lang, "id");
    assert.equal(q("#generation-description").textContent, "Pilih klien PIC saat ini atau daftar tahunan sebelumnya. Klien yang sudah ada pada tahun ini tidak ditambahkan lagi.");
    assert.equal(q("#search").getAttribute("placeholder"),"Cari klien, PIC, atau catatan...");
    assert.equal(type.options[0].textContent, "Orang Pribadi");
    assert.equal(type.value, "Individual");
    assert.equal(new w.FormData(q("#tax-subject-form") as HTMLFormElement).get("subjectType"), "Individual");
    w.dispatchEvent(new w.StorageEvent("storage", { key: "tax-dashboard:language", newValue: "en" }));
    assert.equal(type.value, "Individual");
    assert.equal(type.options[0].textContent, "Individual");
    assert.equal(q("#generation-description").textContent, "Choose current PIC clients or a previous Annual list. Existing client-year rows are skipped.");
  } finally { w.close(); }
});

test("workflow terminology is contextual and status text can change after the switch", async () => {
  const dom = new JSDOM('<html><body><div id="workspace-breadcrumb">Operations / Monthly Compliance / Active Queue</div><button id="database-status-chip">Database: saving (3)</button><div class="case-workflow-block"><h4>Tax Execution</h4><p>Verify all payments before recording SPT submissions.</p></div></body></html>', { url: "https://dashboard.invalid", runScripts: "outside-only" });
  const w = dom.window;
  try {
    w.localStorage.setItem("tax-dashboard:language", "id");
    w.eval(readFileSync(new URL("../public/workspace-language.js", import.meta.url), "utf8"));
    const q = (selector: string) => w.document.querySelector(selector)!;
    assert.equal(q("#workspace-breadcrumb").textContent, "Operasional / Pekerjaan Bulanan / Pekerjaan Berjalan");
    assert.equal(q("h4").textContent, "Pembetulan & Pelaporan SPT");
    assert.equal(q("p").textContent, "Verifikasi semua pembayaran sebelum mencatat pelaporan SPT.");
    assert.equal(q("#database-status-chip").textContent, "Basis data: menyimpan (3)");
    q("#database-status-chip").setAttribute("title", "Database connected");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(q("#database-status-chip").getAttribute("title"), "Basis data terhubung");
  } finally { w.close(); }
});

test("case print output follows the selected language and keeps notes and client names verbatim", () => {
  const dom = new JSDOM("<html></html>", { url: "https://dashboard.invalid", runScripts: "outside-only" });
  const w = dom.window as any;
  try {
    w.eval(readFileSync(new URL("../public/workspace-language.js", import.meta.url), "utf8"));
    w.eval(readFileSync(new URL("../public/case-report.js", import.meta.url), "utf8"));
    const report = {
      category: "Pemeriksaan", filters: [], generatedAt: "2026-11-20T02:00:00Z",
      counts: { handled: 1, progress: 1, payment: 0, revision: 0, done: 0 },
      rows: [{ number: 1, client: "Client", letter: "SPHP-001", taxPic: "Dewa", accPic: "Ivan",
        status: "In Progress", bucket: "progress", latestProgress: { entry: "No progress recorded." }, balance: null }]
    };
    const before = JSON.stringify(report);
    assert.match(w.CaseReports.buildHtml(report), /<h1>Case Report<\/h1>/);
    w.WorkspaceLanguage.set("id");
    const html = w.CaseReports.buildHtml(report);
    assert.match(html, /lang="id"/);
    assert.match(html, /<h1>Laporan Kasus<\/h1>/);
    assert.match(html, /<th>No\. Surat<\/th>/);
    assert.match(html, /<td>Client<\/td>/);
    assert.match(html, /<div>No progress recorded\.<\/div>/);
    assert.equal(JSON.stringify(report), before);
  } finally { w.close(); }
});

test("tax-claim editor localizes controls and status without changing the client document", async () => {
  const html = readFileSync(new URL("../public/tax-claim-template.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "https://dashboard.invalid/tax-claim-template.html", runScripts: "outside-only" });
  const w = dom.window as any;
  try {
    w.localStorage.setItem("tax-dashboard:language", "id");
    w.eval(readFileSync(new URL("../public/workspace-language.js", import.meta.url), "utf8"));
    const q = (selector: string) => w.document.querySelector(selector);
    assert.equal(q("#save-draft").textContent, "Simpan Draf");
    assert.equal(q("#print-claim").textContent, "Cetak / Simpan PDF");
    assert.equal(q("[data-draft=title]").value, "KLAIM PAJAK");
    q("#claim-status").textContent = "Print snapshot fixture-123 saved.";
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(q("#claim-status").textContent, "Salinan cetak fixture-123 tersimpan.");
    w.WorkspaceLanguage.set("en");
    assert.equal(q("#save-draft").textContent, "Save draft");
    assert.equal(q("#claim-status").textContent, "Print snapshot fixture-123 saved.");
    assert.equal(q("#claim-page").lang, "id");
  } finally { w.close(); }
});

test("operational notices translate on toggle without rewriting manual broadcasts or names", () => {
  const html = `<html><body>
    <strong id="case" data-inbox-copy="title" data-inbox-source="tax_case">New Himbauan: Client &amp; Co</strong>
    <p id="assignment" data-inbox-copy="message" data-inbox-source="my_work_task">Dewa assigned you: Save Client</p>
    <p id="manual" data-inbox-copy="message" data-inbox-source="broadcast">Dewa assigned you: Save Client</p>
    <strong id="manual-title" data-inbox-copy="title" data-inbox-source="broadcast">Save Client</strong>
    <p id="case-sheet-status">You are not assigned to this case.</p>
  </body></html>`;
  const dom = new JSDOM(html, { url: "https://dashboard.invalid", runScripts: "outside-only" });
  const w = dom.window as any;
  try {
    w.eval(readFileSync(new URL("../public/workspace-language.js", import.meta.url), "utf8"));
    const text = (id: string) => w.document.getElementById(id).textContent;
    w.WorkspaceLanguage.set("id");
    assert.equal(text("case"), "Imbauan Baru: Client & Co");
    assert.equal(text("assignment"), "Dewa menugaskan Anda: Save Client");
    assert.equal(text("manual"), "Dewa assigned you: Save Client");
    assert.equal(text("manual-title"), "Save Client");
    assert.equal(text("case-sheet-status"), "Anda tidak ditugaskan untuk kasus ini.");
    w.WorkspaceLanguage.set("en");
    assert.equal(text("case"), "New Himbauan: Client & Co");
    assert.equal(text("assignment"), "Dewa assigned you: Save Client");
    assert.equal(text("case-sheet-status"), "You are not assigned to this case.");
  } finally { w.close(); }
});
