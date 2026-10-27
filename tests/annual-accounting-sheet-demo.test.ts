import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import * as XLSX from "xlsx";

const html = readFileSync(new URL("../public/annual-accounting-sheet-demo.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../public/annual-accounting-sheet-demo.js", import.meta.url), "utf8");

function loadDemo(team = "accounting", search = "") {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: `http://localhost/annual-accounting-sheet-demo.html?${team === "tax" ? "team=tax&" : ""}${search}` });
  const w = dom.window as any;
  w.matchMedia = () => ({ matches: false });
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  if (team === "tax") w.eval(readFileSync(new URL("../public/annual-tax-sheet-config.js", import.meta.url), "utf8"));
  w.eval(script);
  const api = w.AnnualSheetDemo;
  const cell = (r: number, c: number) => w.document.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
  const choose = (r: number, c: number) => {
    cell(r, c).dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    w.document.dispatchEvent(new w.MouseEvent("pointerup", { bubbles: true }));
  };
  const key = (name: string, props: Record<string, unknown> = {}) => cell(api.state.selection.r, api.state.selection.c).dispatchEvent(new w.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: name, ...props }));
  const actAs = (id: string) => { const select = w.document.getElementById("actor-select"); select.value = id; select.dispatchEvent(new w.Event("change", { bubbles: true })); };
  const paste = (value: string) => {
    const event = new w.Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => value } });
    w.document.getElementById("annual-grid").dispatchEvent(event);
  };
  return { dom, w, api, cell, choose, key, actAs, paste };
}

test("both annual teams insert blank drafts, expand Excel paste, handle quoted multiline cells and save only named rows", async () => {
  for (const team of ["accounting", "tax"]) {
    const d = loadDemo(team);
    try {
      d.actAs(team === "accounting" ? "acc-cemari" : "tax-bagus");
      const count = d.api.state.rows.length, doc = d.w.document;
      doc.getElementById("bulk-add-button").click();
      assert.equal(d.api.state.rows.length, count, "blank rows must not enter the operational sheet");
      assert.equal(doc.querySelectorAll("#bulk-rows-grid tbody tr").length, 10);
      doc.getElementById("bulk-row-count").value = "5"; doc.getElementById("bulk-insert-rows").click();
      assert.equal(doc.querySelectorAll("#bulk-rows-grid tbody tr").length, 15);
      const fields = Array.from(doc.querySelectorAll('#bulk-rows-grid input[data-r="0"]'), (node: any) => node.dataset.field);
      const values = Array.from({ length: 17 }, (_, r) => {
        const row = Object.fromEntries(fields.map(field => [field, ""]));
        Object.assign(row, { clientName: `New Annual ${team} ${r}`, accountingPic: team === "accounting" ? "cemari" : "", taxPic: team === "tax" ? "BAGUS" : "", progress: team === "accounting" ? "In Process" : "Data Request", notes: r === 0 ? 'Line one\nLine two "quoted"' : "Imported" });
        if (team === "tax") Object.assign(row, { subjectType: "Individual", documents: "2/3", payableAmount: "0" });
        else Object.assign(row, { technicalAdminMonths: "4", dataMonths: "8", reportPreparationMonths: "2", paymentValue: "0" });
        return fields.map(field => /[\t\n"]/.test(row[field]) ? `"${row[field].replace(/"/g, '""')}"` : row[field]).join("\t");
      }).join("\r\n") + "\r\n";
      const paste = new d.w.Event("paste", { bubbles: true, cancelable: true }); Object.defineProperty(paste, "clipboardData", { value: { getData: () => values } });
      doc.querySelector('#bulk-rows-grid input[data-r="0"][data-c="0"]').dispatchEvent(paste);
      assert.equal(doc.querySelectorAll("#bulk-rows-grid tbody tr").length, 17);
      assert.equal(d.api.state.rows.length, count);
      doc.querySelector('[data-close="bulk-rows-dialog"]').click();
      doc.getElementById("bulk-add-button").click();
      assert.equal(doc.querySelectorAll("#bulk-rows-grid tbody tr").length, 17, "closing a draft preview should not discard its pasted rows");
      const firstCell = doc.querySelector('#bulk-rows-grid input[data-r="0"][data-c="0"]');
      firstCell.dispatchEvent(new d.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      assert.equal(doc.activeElement.dataset.r, "1");
      doc.activeElement.dispatchEvent(new d.w.KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));
      assert.equal(doc.activeElement.dataset.r, "0");
      doc.getElementById("bulk-save-rows").click(); await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(doc.getElementById("bulk-rows-dialog").open, false, doc.getElementById("bulk-rows-error").textContent);
      const imported = d.api.state.rows.filter((row: any) => row.clientName.startsWith(`New Annual ${team}`));
      assert.equal(imported.length, 17); assert.equal(new Set(imported.map((row: any) => row.id)).size, 17);
      assert.equal(imported[0].notes, 'Line one\nLine two "quoted"');
      assert.equal(team === "tax" ? imported[0].taxPicId : imported[0].accountingPicId, team === "tax" ? "tax-bagus" : "acc-cemari");
      assert.equal(team === "tax" ? imported[0].payableAmount : imported[0].paymentValue, 0);
      assert.equal(team === "tax" ? imported[0].documents.length : imported[0].dataMonths.length, team === "tax" ? 2 : 8);
    } finally { d.dom.window.close(); }
  }
});

test("bulk drafts reject invalid values, cross-PIC assignments and oversized paste without changing the existing sheet", async () => {
  const d = loadDemo();
  try {
    d.actAs("acc-cemari"); const doc = d.w.document, before = JSON.stringify(d.api.state.rows);
    doc.getElementById("bulk-add-button").click();
    const input = (field: string, value: string) => { const node = doc.querySelector(`#bulk-rows-grid input[data-r="0"][data-field="${field}"]`); node.value = value; node.dispatchEvent(new d.w.Event("input", { bubbles: true })); };
    input("clientName", "External draft"); input("accountingPic", "Ivan");
    doc.getElementById("bulk-save-rows").click(); await new Promise<void>(resolve => setImmediate(resolve));
    assert.match(doc.getElementById("bulk-rows-error").textContent, /own work/); assert.equal(JSON.stringify(d.api.state.rows), before);
    input("accountingPic", "Cemari"); input("dataMonths", "13");
    doc.getElementById("bulk-save-rows").click(); await new Promise<void>(resolve => setImmediate(resolve));
    assert.match(doc.getElementById("bulk-rows-error").textContent, /0-12/); assert.equal(JSON.stringify(d.api.state.rows), before);
    const paste = new d.w.Event("paste", { bubbles: true, cancelable: true }); Object.defineProperty(paste, "clipboardData", { value: { getData: () => Array.from({ length: 251 }, () => "External").join("\n") } });
    doc.querySelector('#bulk-rows-grid input[data-r="0"][data-c="0"]').dispatchEvent(paste);
    assert.equal(doc.querySelectorAll("#bulk-rows-grid tbody tr").length, 10); assert.equal(JSON.stringify(d.api.state.rows), before);
  } finally { d.dom.window.close(); }
});

test("Add Client dropdown retains generation and external-work actions for both annual teams", () => {
  for (const team of ["accounting", "tax"]) {
    const d = loadDemo(team);
    try {
      const button = d.w.document.getElementById("add-client-button"), menu = d.w.document.getElementById("add-client-menu");
      assert.equal(menu.hidden, true);
      button.click(); assert.equal(menu.hidden, false); assert.equal(button.getAttribute("aria-expanded"), "true");
      assert.equal(d.w.document.getElementById("generate-button").textContent, "Generate Clients");
      assert.equal(d.w.document.getElementById("outside-button").textContent, "Add Ext Client");
      d.w.document.getElementById("generate-button").click();
      assert.equal(menu.hidden, true); assert.equal(d.w.document.getElementById("generate-dialog").open, true);
      d.w.document.getElementById("generate-dialog").close();
      button.click(); d.w.document.getElementById("outside-button").click();
      assert.equal(menu.hidden, true);
      assert.equal(d.w.document.getElementById(team === "tax" ? "tax-subject-dialog" : "outside-dialog").open, true);
      button.click(); button.dispatchEvent(new d.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      assert.equal(menu.hidden, true); assert.equal(d.w.document.activeElement, button);
    } finally { d.dom.window.close(); }
  }
});

test("Full Screen opens a standalone new tab retaining team, year, filters and sort, with both teams available", () => {
  const d = loadDemo("tax", "embedded=1&year=2024&status=complete&view=filing&pic=Ivan&taxPic=Bagus&search=Rin&sort=clientName&direction=desc");
  try {
    const link = d.w.document.getElementById("fullscreen-button"), url = new URL(link.href);
    assert.equal(link.target, "_blank"); assert.match(link.rel, /noopener/);
    assert.equal(url.searchParams.has("embedded"), false); assert.equal(url.searchParams.get("fullscreen"), "1");
    for (const [key, value] of [["team", "tax"], ["year", "2024"], ["status", "complete"], ["view", "filing"], ["pic", "Ivan"], ["taxPic", "Bagus"], ["search", "Rin"], ["direction", "desc"]]) assert.equal(url.searchParams.get(key), value);
    const fullscreen = loadDemo("tax", url.searchParams.toString());
    try {
      assert.equal(fullscreen.w.document.documentElement.classList.contains("sheet-fullscreen"), true);
      assert.equal(fullscreen.w.document.getElementById("fullscreen-team-tabs").hidden, false);
      assert.equal(fullscreen.w.document.getElementById("fullscreen-button").hidden, true);
      assert.equal(fullscreen.api.state.year, 2024); assert.equal(fullscreen.api.state.view, "filing"); assert.equal(fullscreen.api.state.status, "complete");
      const accounting = new URL(fullscreen.w.document.querySelector('[data-sheet-team="accounting"]').href);
      assert.equal(accounting.searchParams.get("team"), null); assert.equal(accounting.searchParams.get("view"), null); assert.equal(accounting.searchParams.get("year"), "2024");
    } finally { fullscreen.dom.window.close(); }
  } finally { d.dom.window.close(); }
});

test("row numbers open delete actions for both teams, confirm removal, preserve data and restore from Deleted", () => {
  for (const team of ["accounting", "tax"]) {
    const d = loadDemo(team);
    try {
      const row = d.api.visible[0], id = row.id, original = JSON.stringify(row);
      const count = d.api.visible.length, activeCount = d.w.document.getElementById("metric-total").textContent;
      const trigger = () => [...d.w.document.querySelectorAll("[data-row-actions]")].find((button: any) => button.dataset.rowActions === id);
      trigger().click();
      assert.equal(d.w.document.getElementById("row-actions-menu").hidden, false);
      assert.equal(d.w.document.getElementById("manage-row-button").textContent, "Delete Row");
      d.w.document.getElementById("manage-row-button").click();
      assert.equal(d.w.document.getElementById("delete-row-dialog").open, true);
      assert.match(d.w.document.getElementById("delete-row-name").textContent, new RegExp(row.clientName));
      assert.equal(d.api.visible.length, count, "opening confirmation must not delete anything");
      d.w.document.querySelector('[data-close="delete-row-dialog"]').click();
      assert.equal(d.api.visible.length, count);
      trigger().click(); d.w.document.getElementById("manage-row-button").click(); d.w.document.getElementById("confirm-delete-row").click();
      assert.equal(d.api.state.rows.some((item: any) => item.id === id), true);
      assert.equal(d.api.visible.some((item: any) => item.id === id), false);
      assert.equal(d.w.document.getElementById("deleted-count").textContent, "1");
      assert.equal(Number(d.w.document.getElementById("metric-total").textContent), Number(activeCount) - 1);
      const workbook = d.api.buildExportWorkbook(XLSX, { year: 2025, rows: d.api.state.rows.filter((item: any) => item.year === 2025), customColumns: [] });
      const exportRows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets.Summary, { range: 4 });
      assert.equal(exportRows.length, Number(activeCount) - 1);
      assert.equal(exportRows.some(item => item["Annual Work ID"] === id), false);
      d.w.document.querySelector('[data-status="deleted"]').click();
      assert.equal(d.api.visible[0].id, id); assert.equal(d.api.canEdit(d.api.visible[0], d.api.columns.find((col: any) => col.field === "notes")), false);
      assert.equal(d.w.document.getElementById("export-button").disabled, true);
      trigger().click(); d.w.document.getElementById("manage-row-button").click();
      assert.equal(d.w.document.getElementById("deleted-count").textContent, "0");
      const restored = d.api.state.rows.find((item: any) => item.id === id);
      const { deletedAt, deletedByProfileId, ...data } = restored;
      assert.equal(JSON.stringify(data), original);
    } finally { d.dom.window.close(); }
  }
});

test("non-PIC and assistant row-number menus cannot delete, and Escape returns focus", () => {
  const d = loadDemo();
  try {
    d.actAs("acc-cemari");
    const row = d.api.visible.find((item: any) => item.assistantIds.includes("acc-cemari"));
    const button = [...d.w.document.querySelectorAll("[data-row-actions]")].find((item: any) => item.dataset.rowActions === row.id);
    button.dispatchEvent(new d.w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    assert.equal(d.w.document.getElementById("manage-row-button").disabled, true);
    assert.equal(d.api.canEdit(row, d.api.columns.find((col: any) => col.field === "notes")), true, "assistance edit permission must not imply deletion permission");
    d.w.document.dispatchEvent(new d.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(d.w.document.getElementById("row-actions-menu").hidden, true);
    assert.equal(d.w.document.activeElement, button);
  } finally { d.dom.window.close(); }
});

test("Accounting column titles are centered with distinct group colors that survive sorting", () => {
  const d = loadDemo();
  try {
    const style = d.w.document.createElement("style");
    style.textContent = readFileSync(new URL("../public/annual-accounting-sheet-demo.css", import.meta.url), "utf8");
    d.w.document.head.append(style);
    const fullScreenIcon = d.w.getComputedStyle(d.w.document.querySelector("#fullscreen-button>svg"));
    assert.equal(fullScreenIcon.width, "16px"); assert.equal(fullScreenIcon.height, "16px");
    const backgrounds = new Set<string>();
    for (const group of ["admin", "data", "preparation", "payment", "deadline"]) {
      const headers = Array.from(d.w.document.querySelectorAll(`#annual-grid thead th[data-header-group="${group}"]`)) as any[];
      assert.ok(headers.length >= 2, `${group} must color both header rows`);
      const color = d.w.getComputedStyle(headers[0]).backgroundColor;
      backgrounds.add(color);
      for (const header of headers) {
        assert.equal(d.w.getComputedStyle(header).backgroundColor, color);
        assert.equal(d.w.getComputedStyle(header).textAlign, "center");
      }
    }
    assert.equal(backgrounds.size, 5);
    const c = d.api.columns.findIndex((col: any) => col.field === "technicalAdminMonths");
    let heading = d.w.document.querySelector(`[data-sort-col="${c}"]`);
    assert.equal(d.w.getComputedStyle(heading).textAlign, "center");
    const original = d.w.getComputedStyle(heading.closest("th")).backgroundColor;
    heading.click();
    heading = d.w.document.querySelector(`[data-sort-col="${c}"]`);
    assert.equal(heading.closest("th").getAttribute("aria-sort"), "ascending");
    assert.equal(d.w.getComputedStyle(heading.closest("th")).backgroundColor, original);
  } finally { d.dom.window.close(); }
});

test("demo PIC and Progress dropdowns are directly available and PIC changes update ownership ID", () => {
  const d = loadDemo();
  try {
    const id = d.api.visible[0].id;
    const pic = d.cell(0, 1).querySelector("select");
    assert.ok(pic, "PIC must be a native dropdown before double-clicking");
    assert.ok(d.cell(0, 3).querySelector("select"));
    pic.value = "Cemari"; pic.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    const row = d.api.state.rows.find((item: any) => item.id === id);
    assert.equal(row.accountingPic, "Cemari");
    assert.equal(row.accountingPicId, "acc-cemari");
    d.actAs("acc-cemari");
    assert.equal(d.api.canEdit(row, d.api.columns[4]), true);
    assert.equal(d.api.canEdit(row, d.api.columns[1]), false);
  } finally { d.dom.window.close(); }
});

test("demo locks other PIC work against mouse, keyboard, formula edits and paste", () => {
  const d = loadDemo();
  try {
    d.actAs("acc-cemari");
    const r = d.api.visible.findIndex((row: any) => row.accountingPicId !== "acc-cemari" && !row.assistantIds.includes("acc-cemari"));
    const before = JSON.stringify(d.api.state.rows);
    d.choose(r, 4); d.key(" "); d.paste("0\t1");
    assert.equal(JSON.stringify(d.api.state.rows), before);
    assert.equal(d.w.document.getElementById("cell-value").disabled, true);
    assert.equal(d.cell(r, 4).getAttribute("aria-readonly"), "true");
    assert.equal(d.cell(r, 1).querySelector("select"), null);
    assert.match(d.w.document.getElementById("toast").textContent, /Nothing was pasted/);
    const assistantRow = d.api.visible.find((row: any) => row.assistantIds.includes("acc-cemari"));
    assert.ok(assistantRow);
    assert.equal(d.api.canEdit(assistantRow, d.api.columns[4]), true);
    d.actAs("tax-bagus");
    assert.ok(d.api.visible.some((row: any) => row.taxPicId === "tax-bagus"));
    assert.equal(d.api.visible.some((row: any) => d.api.canEdit(row, d.api.columns[4])), false);
  } finally { d.dom.window.close(); }
});

test("mixed-permission fill-down is atomic and actor changes clear previous undo history", () => {
  const d = loadDemo();
  try {
    const noteCol = d.api.columns.findIndex((col: any) => col.field === "notes");
    d.choose(0, noteCol); d.paste("Supervisor note");
    assert.equal(d.api.state.history.length, 1);
    d.actAs("acc-cemari");
    assert.equal(d.api.state.history.length, 0);
    d.choose(0, noteCol); d.key("ArrowDown", { shiftKey: true });
    assert.ok(d.api.state.range);
    const before = JSON.stringify(d.api.state.rows);
    d.key("d", { ctrlKey: true });
    assert.equal(JSON.stringify(d.api.state.rows), before);
    assert.match(d.w.document.getElementById("toast").textContent, /Nothing was filled/);
  } finally { d.dom.window.close(); }
});

test("Excel-style navigation and fill-down work in the summary-only accounting sheet", () => {
  const d = loadDemo();
  try {
    const noteCol = d.api.columns.findIndex((col: any) => col.field === "notes");
    d.choose(0, noteCol); d.key("Enter"); assert.equal(d.api.state.selection.r, 1);
    d.key("Enter", { shiftKey: true }); assert.equal(d.api.state.selection.r, 0);
    d.paste("Shared next action");
    d.key("ArrowDown", { shiftKey: true }); d.key("d", { ctrlKey: true });
    assert.equal(d.api.visible[1].notes, "Shared next action");
    d.key("Tab"); assert.equal(d.api.state.selection.r, 1); assert.equal(d.api.state.selection.c, 0);
    d.key("End", { ctrlKey: true }); assert.equal(d.api.state.selection.r, d.api.visible.length - 1);
    d.w.document.querySelector('[data-view="summary"]').click();
    assert.equal(d.api.columns.filter((col: any) => col.type === "range").length, 3);
    assert.equal(d.w.document.querySelectorAll("[data-view]").length, 1);
    assert.equal(d.w.document.querySelector("[data-open-control]"), null);
    assert.equal(d.api.state.view, "summary");
    assert.equal(d.api.columns.filter((col: any) => col.type === "check").length, 0);
  } finally { d.dom.window.close(); }
});

test("bulk generation preview is scoped to the demo ACC identity", () => {
  const d = loadDemo();
  try {
    d.actAs("acc-cemari");
    const year = d.w.document.getElementById("year-select"); year.value = "2026"; year.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    d.w.document.getElementById("generate-button").click();
    assert.equal(d.w.document.querySelectorAll("#candidate-list input:not(:disabled)").length, 4);
    d.w.document.getElementById("confirm-generate").click();
    assert.equal(d.api.visible.length, 4);
    assert.ok(d.api.visible.every((row: any) => row.accountingPicId === "acc-cemari"));
  } finally { d.dom.window.close(); }
});

test("Tax and ACC filters combine, and column headings toggle workflow and progress-bar sorting", () => {
  const d = loadDemo();
  try {
    const filter = (id: string, value: string) => { const element = d.w.document.getElementById(id); element.value = value; element.dispatchEvent(new d.w.Event("change", { bubbles: true })); };
    filter("tax-pic-filter", "Bagus");
    assert.ok(d.api.visible.length > 0);
    assert.ok(d.api.visible.every((row: any) => row.taxPic === "Bagus"));
    filter("pic-filter", "Cemari");
    assert.equal(d.api.visible.length, 1);
    assert.equal(d.api.visible[0].accountingPic, "Cemari");
    filter("tax-pic-filter", "Denny");
    assert.ok(d.api.visible.every((row: any) => row.taxPic === "Denny" && row.accountingPic === "Cemari"));
    filter("tax-pic-filter", ""); filter("pic-filter", "");
    const heading = (c: number) => d.w.document.querySelector(`[data-sort-col="${c}"]`);
    heading(3).click();
    assert.equal(d.api.state.sort.direction, "asc");
    assert.equal(d.api.visible[0].progress, "Data Request");
    heading(3).click();
    assert.equal(d.api.state.sort.direction, "desc");
    assert.equal(d.api.visible[0].progress, "SPT Ready");
    assert.equal(heading(3).closest("th").getAttribute("aria-sort"), "descending");
    heading(5).click();
    assert.equal(d.api.visible[0].dataMonths.length, 0);
    heading(5).click();
    assert.equal(d.api.visible[0].dataMonths.length, 12);
  } finally { d.dom.window.close(); }
});

test("existing custom number columns retain sorting, value undo and ownership checks after removing Add Column", () => {
  const d = loadDemo();
  try {
    assert.equal(d.w.document.getElementById("add-column-button"), null);
    assert.equal(d.w.document.getElementById("column-dialog"), null);
    d.api.state.customColumns = [{ field: "custom_existing", title: "Adjustment amount", type: "number", width: 120 }];
    d.w.document.getElementById("reset-filters").click();
    const field = d.api.state.customColumns[0].field;
    let c = d.api.columns.findIndex((col: any) => col.field === field);
    d.choose(0, c); d.paste("10\n2\n0");
    d.w.document.querySelector(`[data-sort-col="${c}"]`).click();
    assert.deepEqual(Array.from(d.api.visible.slice(0, 3), (row: any) => row[field]), [0, 2, 10]);
    assert.equal(d.cell(0, c).querySelector(".cell-content").textContent, "0");
    d.w.document.querySelector(`[data-sort-col="${c}"]`).click();
    assert.deepEqual(Array.from(d.api.visible.slice(0, 3), (row: any) => row[field]), [10, 2, 0]);
    assert.equal(d.api.visible[d.api.visible.length - 1][field], undefined);
    d.w.document.getElementById("undo-button").click();
    assert.equal(d.api.state.rows.some((row: any) => row[field] !== undefined), false);
    d.w.document.getElementById("redo-button").click();
    assert.equal(d.api.state.customColumns.length, 1);
    d.actAs("acc-cemari");
    c = d.api.columns.findIndex((col: any) => col.field === field);
    const other = d.api.visible.findIndex((row: any) => row.accountingPicId !== "acc-cemari" && !row.assistantIds.includes("acc-cemari"));
    const beforeRows = JSON.stringify(d.api.state.rows);
    d.choose(other, c); d.paste("99");
    assert.equal(JSON.stringify(d.api.state.rows), beforeRows);
  } finally { d.dom.window.close(); }
});

test("Excel export includes full selected-year Summary and monthly controls despite active filters", async () => {
  const d = loadDemo();
  try {
    d.api.state.customColumns = [
      { field: "custom_number", title: "Adjustment", type: "number", width: 120 },
      { field: "custom_date", title: "Review date", type: "date", width: 120 }
    ];
    const source = d.api.state.rows.find((row: any) => row.year === 2025);
    source.custom_number = 0; source.custom_date = "2026-05-01"; source.notes = "=SUM(1,2)"; source.paymentValue = 0;
    const taxFilter = d.w.document.getElementById("tax-pic-filter"); taxFilter.value = "Bagus"; taxFilter.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    const search = d.w.document.getElementById("search"); search.value = "Bumi"; search.dispatchEvent(new d.w.Event("input", { bubbles: true }));
    assert.equal(d.api.visible.length, 1);
    let output: any;
    d.w.eval(readFileSync(new URL("../public/vendor/xlsx.full.min.js", import.meta.url), "utf8"));
    d.w.XLSX.writeFile = (book: XLSX.WorkBook, filename: string) => { output = { book, filename }; };
    d.w.document.getElementById("export-button").click();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(output.filename, "annual-accounting-summary-2025.xlsx");
    const bytes = Buffer.from(d.w.XLSX.write(output.book, { type: "array", bookType: "xlsx", cellDates: true }));
    const reopened = XLSX.read(bytes, { type: "buffer", cellDates: true });
    assert.deepEqual(reopened.SheetNames, ["Summary", "Monthly Controls"]);
    const summary = XLSX.utils.sheet_to_json<Record<string, any>>(reopened.Sheets.Summary, { range: 4, defval: "" });
    const details = XLSX.utils.sheet_to_json<Record<string, any>>(reopened.Sheets["Monthly Controls"], { range: 4, defval: "" });
    assert.equal(summary.length, 14);
    assert.equal(details.length, 14);
    assert.equal(summary.filter(row => row.Completion === "Complete").length, 2);
    const row = summary.find(item => item["Annual Work ID"] === source.id)!;
    assert.equal(row.Adjustment, 0);
    assert.equal(row["Payment value (Rp)"], 0);
    assert.equal(row["NTPE / submit proof no."], "");
    assert.ok(row["Review date"] instanceof Date);
    assert.equal(row["Review date"].toISOString().slice(0, 10), "2026-05-01");
    assert.equal(row["Note / next action"], "=SUM(1,2)");
    assert.equal(row["Admin teknis (months)"], source.technicalAdminMonths.length);
    assert.equal(row["Data (months)"], source.dataMonths.length);
    assert.equal(row["Penyusunan (months)"], source.reportPreparationMonths.length);
    assert.equal(row["Checklist coverage"], (source.technicalAdminMonths.length + source.dataMonths.length + source.reportPreparationMonths.length) / 36);
    const detail = details.find(item => item["Annual Work ID"] === source.id)!;
    assert.equal(detail["Payment value (Rp)"], 0);
    assert.equal(Object.keys(detail).filter(key => /^(Admin teknis|Data|Penyusunan) /.test(key)).length, 36);
    assert.equal(Object.entries(detail).filter(([key, value]) => key.startsWith("Data ") && value === "X").length, source.dataMonths.length);
    const noteCells = Object.values(reopened.Sheets.Summary).filter((cell: any) => cell?.v === "=SUM(1,2)") as any[];
    assert.equal(noteCells.length, 1);
    assert.equal(noteCells[0].t, "s"); assert.equal(noteCells[0].f, undefined);
    assert.equal(d.w.document.getElementById("export-button").disabled, false);
  } finally { d.dom.window.close(); }
});

test("Annual Tax uses subject-based milestone groups and Tax PIC ownership", () => {
  const d = loadDemo("tax");
  try {
    assert.equal(d.api.state.rows.filter((row: any) => row.year === 2025).length, 10);
    assert.equal(d.api.visible.length, 8);
    assert.equal(d.api.columns.filter((col: any) => col.type === "summary").length, 3);
    d.w.document.querySelector('[data-open-control="documents"]').click();
    assert.equal(d.api.columns.filter((col: any) => col.type === "check").length, 3);
    assert.equal(d.api.columns.find((col: any) => col.type === "check").title, "Previous SPT");
    d.actAs("tax-bagus");
    const row = d.api.visible.find((item: any) => item.taxPicId === "tax-bagus");
    const check = d.api.columns.find((col: any) => col.type === "check");
    assert.equal(d.api.canEdit(row, check), true);
    assert.equal(d.api.canEdit(d.api.visible.find((item: any) => item.taxPicId !== "tax-bagus" && !item.assistantIds.includes("tax-bagus")), check), false);
    d.actAs("acc-ivan");
    assert.equal(d.api.visible.some((item: any) => d.api.canEdit(item, check)), false);
    d.actAs("acc-dewayu");
    const assisted = d.api.visible.find((item: any) => item.assistantIds.includes("acc-dewayu"));
    assert.equal(d.api.canEdit(assisted, check), true);
  } finally { d.dom.window.close(); }
});

test("Annual Tax manual subjects remain distinct and reviewed new-year suggestions reset milestones", () => {
  const d = loadDemo("tax");
  try {
    d.actAs("tax-bagus");
    for (const name of ["Director A", "Director B"]) {
      d.w.document.getElementById("outside-button").click();
      const form = d.w.document.getElementById("tax-subject-form");
      form.elements.name.value = name; form.elements.groupName.value = "Shared Company";
      form.dispatchEvent(new d.w.Event("submit", { bubbles: true, cancelable: true }));
    }
    const added = d.api.state.rows.filter((row: any) => row.groupName === "Shared Company");
    assert.equal(added.length, 2); assert.notEqual(added[0].subjectId, added[1].subjectId);
    assert.ok(added.every((row: any) => row.taxPicId === "tax-bagus"));
    const year = d.w.document.getElementById("year-select"); year.value = "2026"; year.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    d.w.document.getElementById("generate-button").click();
    assert.equal(d.w.document.querySelectorAll("#candidate-list input:checked").length, 0);
    const selected = [...d.w.document.querySelectorAll("#candidate-list input")].filter((input: any) => added.some((row: any) => row.subjectId === input.value));
    assert.equal(selected.length, 2);
    selected.forEach((input: any) => { input.checked = true; input.dispatchEvent(new d.w.Event("change", { bubbles: true })); });
    d.w.document.getElementById("confirm-generate").click();
    assert.equal(d.api.visible.length, 2);
    assert.ok(d.api.visible.every((row: any) => row.groupName === "Shared Company" && !row.documents.length && !row.preparation.length && !row.filing.length && row.payableAmount === "" && row.ntpe === ""));
    d.w.document.getElementById("generate-button").click();
    assert.equal(d.w.document.querySelectorAll("#candidate-list input:disabled").length, 2);
  } finally { d.dom.window.close(); }
});

test("Annual Tax cannot complete without filing evidence and distinguishes unknown payable from nil", () => {
  const d = loadDemo("tax");
  try {
    const row = d.api.visible[0], originalProgress = row.progress;
    const setProgress = (value: string) => { const index = d.api.visible.findIndex((item: any) => item.id === row.id); const c = d.api.columns.findIndex((col: any) => col.field === "progress"); const input = d.cell(index, c).querySelector("select"); input.value = value; input.dispatchEvent(new d.w.Event("change", { bubbles: true })); };
    setProgress("Reported");
    assert.equal(row.progress, originalProgress);
    row.filing = [0, 2]; row.filingDate = "2026-03-15"; row.ntpe = "DEMO-RECEIPT"; row.payableAmount = "";
    assert.match(d.w.AnnualTaxSheetConfig.completionError(row), /payable amount/);
    row.payableAmount = 0;
    assert.equal(d.w.AnnualTaxSheetConfig.completionError(row), "");
    row.payableAmount = 150000;
    assert.match(d.w.AnnualTaxSheetConfig.completionError(row), /NTPN/);
    row.filing = [0, 1, 2]; row.paymentNtpn = "DEMO-NTPN"; row.paymentDate = "2026-03-14";
    setProgress("Reported");
    assert.equal(row.progress, "Reported");
    assert.equal(d.api.visible.some((item: any) => item.id === row.id), false);
    assert.equal(d.w.document.getElementById("metric-done").textContent, "3");
  } finally { d.dom.window.close(); }
});

test("Annual Tax Excel workbook exports all subjects, correct milestone details, and numeric nil", () => {
  const d = loadDemo("tax");
  try {
    d.w.eval(readFileSync(new URL("../public/vendor/xlsx.full.min.js", import.meta.url), "utf8"));
    const snapshot = { year: 2025, rows: d.api.state.rows.filter((row: any) => row.year === 2025), customColumns: [] };
    const workbook = d.api.buildExportWorkbook(d.w.XLSX, snapshot);
    const reopened = XLSX.read(Buffer.from(d.w.XLSX.write(workbook, { type: "array", bookType: "xlsx", cellDates: true })), { type: "buffer", cellDates: true });
    assert.deepEqual(reopened.SheetNames, ["Summary", "SPT Details"]);
    const summary = XLSX.utils.sheet_to_json<Record<string, any>>(reopened.Sheets.Summary, { range: 4, defval: "" });
    const details = XLSX.utils.sheet_to_json<Record<string, any>>(reopened.Sheets["SPT Details"], { range: 4, defval: "" });
    assert.equal(summary.length, 10); assert.equal(details.length, 10);
    assert.equal(summary.filter(row => row.Completion === "Complete").length, 2);
    assert.equal(summary.find(row => row["SPT subject"] === "Rin Sagisaka")!["Tax payable (Rp)"], 0);
    assert.equal(summary.find(row => row["SPT subject"] === "Yuki Tanaka")!["Tax payable (Rp)"], "");
    assert.equal(Object.keys(details[0]).filter(key => key.includes(": ")).length, 9);
    assert.equal(new Set(summary.map(row => row["Subject ID"])).size, 10);
  } finally { d.dom.window.close(); }
});

test("Accounting PIC progress counts each owner once, includes outside work, and handles empty assignments", () => {
  const d = loadDemo();
  try {
    const rows = d.api.state.rows.filter((row: any) => row.year === 2025);
    const groups = Array.from(d.api.accountingPicProgress(rows)) as any[];
    assert.equal(groups.reduce((sum, group) => sum + group.total, 0), 14);
    assert.equal(groups.reduce((sum, group) => sum + group.completed, 0), 2);
    assert.equal(groups.reduce((sum, group) => sum + group.remaining, 0), 12);
    assert.equal(groups.find(group => group.name === "Cemari").total, 4, "Cemari's assistance on another owner's row must not double count");
    assert.equal(groups.find(group => group.name === "Dewayu").percent, 33.3);
    assert.deepEqual({ ...groups.find(group => group.name === "Dewayu").coverage }, { technicalAdminMonths: 69.4, dataMonths: 83.3, reportPreparationMonths: 52.8 });
    assert.deepEqual({ ...groups.find(group => group.name === "Cemari").coverage }, { technicalAdminMonths: 56.3, dataMonths: 68.8, reportPreparationMonths: 50 });
    const previousYear = Array.from(d.api.accountingPicProgress(d.api.state.rows.filter((row: any) => row.year === 2024))) as any[];
    assert.equal(previousYear.find(group => group.name === "Tantri").percent, null);
    assert.ok(Object.values(previousYear.find(group => group.name === "Tantri").coverage).every(value => value === null));
    assert.equal(previousYear.find(group => group.name === "Cemari").percent, 100);
    const unassigned = { ...rows[0], id: "unassigned-work", accountingPic: "", accountingPicId: "", progress: "Data Request" };
    const withUnassigned = Array.from(d.api.accountingPicProgress([...rows, unassigned])) as any[];
    assert.equal(withUnassigned.find(group => group.id === "unassigned").remaining, 1);
    assert.ok(Array.from(d.api.accountingPicProgress([])).every((group: any) => group.total === 0 && group.percent === null));
    const teamCoverage = Array.from(d.api.accountingControlCoverage(rows)) as any[];
    assert.deepEqual(teamCoverage.map(control => control.checked), [111, 147, 121]);
    assert.deepEqual(teamCoverage.map(control => control.percent), [66.1, 87.5, 72]);
    assert.ok(teamCoverage.every(control => control.total === 168));
    assert.ok(Array.from(d.api.accountingControlCoverage([])).every((control: any) => control.percent === null));
  } finally { d.dom.window.close(); }
});

test("Tax team overview counts subjects by primary Tax PIC, uses milestone denominators and does not double-count assistants", () => {
  const d = loadDemo("tax");
  try {
    const rows = d.api.state.rows.filter((row: any) => row.year === 2025), groups = Array.from(d.api.taxPicProgress(rows)) as any[];
    assert.equal(groups.length, 7); assert.equal(groups.reduce((sum, group) => sum + group.total, 0), 10);
    assert.equal(groups.reduce((sum, group) => sum + group.completed, 0), 2);
    const bagus = groups.find(group => group.id === "tax-bagus");
    assert.equal(bagus.total, 3, "assisting Dinar's return is not another primary assignment");
    assert.equal(bagus.completed, 2); assert.equal(bagus.remaining, 1); assert.equal(bagus.percent, 66.7);
    assert.equal(groups.find(group => group.name === "Okta").total, 1);
    const coverage = Array.from(d.api.taxControlCoverage(rows)) as any[];
    for (const control of coverage) {
      assert.equal(control.total, 30, "three milestones per subject, not twelve accounting months");
      const checked = rows.reduce((sum: number, row: any) => sum + row[control.field].length, 0);
      assert.equal(control.checked, checked); assert.equal(control.percent, Math.round(checked / 30 * 1000) / 10);
    }
    const incompleteEvidence = { ...rows[0], progress: "Done", filing: [], ntpe: "", historicalCompletion: false };
    assert.equal(Array.from(d.api.taxPicProgress([incompleteEvidence])).find((group: any) => group.id === "tax-bagus").completed, 0);
    assert.ok(Array.from(d.api.taxPicProgress([])).every((group: any) => group.total === 0 && group.percent === null));
    assert.ok(Array.from(d.api.taxControlCoverage([])).every((control: any) => control.percent === null));
  } finally { d.dom.window.close(); }
});

test("Tax overview is collapsed by default, filters Tax PICs and retains full-year metrics across all milestone views", () => {
  const d = loadDemo("tax");
  try {
    const doc = d.w.document, board = doc.getElementById("accounting-pic-progress"), content = doc.getElementById("pic-progress-content");
    assert.equal(board.hidden, false); assert.equal(content.hidden, true); assert.equal(doc.getElementById("annual-overview").hidden, true);
    assert.match(doc.getElementById("pic-progress-totals").textContent, /10 SPT subjects/);
    assert.equal(doc.querySelector(".pic-progress-table").getAttribute("aria-label"), "Tax PIC completion");
    assert.equal(doc.querySelector("[data-team-complete]").textContent, "20%");
    const coverage = ["documents", "preparation", "filing"].map(field => doc.querySelector(`[data-team-control-coverage="${field}"]`).textContent);
    doc.getElementById("toggle-pic-progress").click(); assert.equal(content.hidden, false);
    const bagus = () => doc.querySelector('[data-pic-progress-id="tax-bagus"]');
    bagus().click();
    assert.equal(d.api.state.taxPic, "Bagus"); assert.equal(d.api.state.pic, "");
    assert.equal(doc.getElementById("tax-pic-filter").value, "Bagus"); assert.equal(d.api.visible.length, 1);
    assert.equal(bagus().getAttribute("aria-selected"), "true");
    for (const view of ["documents", "preparation", "filing", "all", "summary"]) {
      doc.querySelector(`[data-view="${view}"]`).click();
      assert.equal(doc.getElementById("accounting-pic-progress"), board); assert.equal(board.hidden, false); assert.equal(content.hidden, false);
      assert.equal(doc.querySelector("[data-team-complete]").textContent, "20%");
      assert.deepEqual(["documents", "preparation", "filing"].map(field => doc.querySelector(`[data-team-control-coverage="${field}"]`).textContent), coverage);
    }
    bagus().dispatchEvent(new d.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    assert.equal(d.api.state.taxPic, ""); assert.equal(d.api.visible.length, 8);
    doc.getElementById("toggle-pic-progress").click(); assert.equal(content.hidden, true);
    const year = doc.getElementById("year-select"); year.value = "2024"; year.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.equal(doc.querySelector("[data-team-complete]").textContent, "100%");
    assert.match(doc.getElementById("pic-progress-totals").textContent, /4 SPT subjects/);
  } finally { d.dom.window.close(); }
});

test("Accounting Summary PIC cards filter the sheet and update on completion without following table filters", () => {
  const d = loadDemo();
  try {
    const toggle = d.w.document.getElementById("toggle-pic-progress");
    assert.equal(d.w.document.getElementById("pic-progress-content").hidden, true);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(toggle.textContent, "Show overview");
    toggle.click();
    assert.equal(d.w.document.getElementById("pic-progress-content").hidden, false);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    d.w.document.querySelector('[data-view="summary"]').click();
    const card = () => d.w.document.querySelector('[data-pic-progress-id="acc-dewayu"]');
    const teamCoverage = (field: string) => d.w.document.querySelector(`[data-team-control-coverage="${field}"]`).textContent;
    const teamComplete = () => d.w.document.querySelector("[data-team-complete]").textContent;
    assert.equal(d.w.document.getElementById("accounting-pic-progress").hidden, false);
    assert.equal(d.w.document.getElementById("annual-overview").hidden, true);
    assert.equal(d.w.document.querySelectorAll(".pic-progress-card").length, 5);
    assert.equal(card().querySelector(".pic-card-percent").textContent, "33.3%");
    assert.equal(card().querySelectorAll("td").length, 4);
    assert.equal(teamCoverage("technicalAdminMonths"), "66.1%");
    assert.equal(teamCoverage("dataMonths"), "87.5%");
    assert.equal(teamCoverage("reportPreparationMonths"), "72%");
    assert.equal(teamComplete(), "14.3%");
    card().click();
    assert.equal(d.w.document.getElementById("pic-filter").value, "Dewayu");
    assert.equal(d.api.visible.length, 2);
    assert.equal(card().getAttribute("aria-selected"), "true");
    assert.equal(teamComplete(), "14.3%");
    assert.equal(teamCoverage("dataMonths"), "87.5%");
    const tax = d.w.document.getElementById("tax-pic-filter"); tax.value = "Bagus"; tax.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.equal(d.api.visible.length, 0);
    assert.equal(card().querySelector(".pic-card-percent").textContent, "33.3%");
    assert.equal(teamCoverage("dataMonths"), "87.5%");
    d.w.document.getElementById("reset-filters").click(); card().click();
    const progressColumn = d.api.columns.findIndex((col: any) => col.field === "progress");
    const select = d.cell(0, progressColumn).querySelector("select"); select.value = "Reported"; select.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.equal(card().querySelector(".pic-card-percent").textContent, "66.7%");
    assert.equal(teamComplete(), "21.4%");
    d.w.document.getElementById("undo-button").click();
    assert.equal(card().querySelector(".pic-card-percent").textContent, "33.3%");
    assert.equal(teamComplete(), "14.3%");
    const awaiting = d.api.visible.findIndex((row: any) => row.progress === "Data Request");
    const stage = d.cell(awaiting, progressColumn).querySelector("select"); stage.value = "In Process"; stage.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.equal(teamCoverage("dataMonths"), "91.1%");
    assert.equal(card().querySelector(".pic-card-percent").textContent, "33.3%");
    d.w.document.getElementById("undo-button").click();
    assert.equal(teamCoverage("dataMonths"), "87.5%");
    d.w.document.getElementById("toggle-pic-progress").click();
    assert.equal(d.w.document.getElementById("pic-progress-content").hidden, true);
    const overview = d.w.document.getElementById("accounting-pic-progress");
    assert.equal(overview.hidden, false);
    assert.equal(overview.parentElement.classList.contains("sheet-shell"), true);
    assert.equal(d.w.document.getElementById("annual-overview").hidden, true);
    assert.equal(d.w.document.getElementById("pic-progress-content").hidden, true);
    for (const action of ["reset-filters", "toggle-pic-progress", "toggle-pic-progress"]) {
      d.w.document.getElementById(action).click();
      assert.equal(d.w.document.getElementById("accounting-pic-progress"), overview);
      assert.equal(overview.hidden, false);
      assert.equal(d.w.document.getElementById("annual-overview").hidden, true);
      assert.equal(teamComplete(), "14.3%");
    }
  } finally { d.dom.window.close(); }
});

test("Accounting sliders preview without rerenders, commit one undo step, and retain sorting and scroll", () => {
  const d = loadDemo();
  try {
    const grid = d.w.document.getElementById("grid-scroll");
    Object.defineProperty(grid, "clientWidth", { value: 1880 });
    grid.scrollTop = 68; grid.scrollLeft = 125;
    const row = d.api.visible[0], old = Array.from(row.dataMonths);
    const c = d.api.columns.findIndex((col: any) => col.field === "dataMonths");
    d.cell(0, c).querySelector("[data-edit-range]").dispatchEvent(new d.w.MouseEvent("click", { bubbles: true, detail: 1 }));
    const slider = d.cell(0, c).querySelector("input");
    const widths = Array.from(d.w.document.querySelectorAll("#annual-grid col"), (col: any) => col.style.width).slice(0, 5);
    for (const value of [3, 4, 5]) {
      slider.value = String(value); slider.dispatchEvent(new d.w.Event("input", { bubbles: true }));
      assert.equal(slider.nextElementSibling.textContent, `${value}/12`);
      assert.equal(slider.getAttribute("aria-valuetext"), `${value} of 12 months`);
      assert.deepEqual(Array.from(row.dataMonths), old);
      assert.equal(d.api.state.history.length, 0);
      assert.equal(d.cell(0, c).querySelector("input"), slider);
    }
    slider.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.deepEqual(Array.from(row.dataMonths), [0, 1, 2, 3, 4]);
    assert.equal(d.api.state.history.length, 1);
    assert.equal(grid.scrollTop, 68); assert.equal(grid.scrollLeft, 125);
    assert.deepEqual(Array.from(d.w.document.querySelectorAll("#annual-grid col"), (col: any) => col.style.width).slice(0, 5), widths);
    d.w.document.getElementById("undo-button").click();
    assert.deepEqual(Array.from(d.api.visible.find((item: any) => item.id === row.id).dataMonths), old);
    d.w.document.getElementById("redo-button").click();
    assert.equal(d.api.visible.find((item: any) => item.id === row.id).dataMonths.length, 5);
    d.w.document.querySelector(`[data-sort-col="${c}"]`).click();
    const sortedIds = Array.from(d.api.visible, (item: any) => item.id);
    d.w.document.getElementById("toggle-pic-progress").click();
    assert.deepEqual(Array.from(d.api.visible, (item: any) => item.id), sortedIds);
    d.choose(0, c); d.key("F2");
    const focused = d.w.document.activeElement;
    assert.equal(focused.matches("[data-grid-range]"), true);
    const arrow = new d.w.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowRight" });
    focused.dispatchEvent(arrow);
    assert.equal(arrow.defaultPrevented, false, "native range keys must not be captured as grid navigation");
    focused.value = "7"; focused.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.equal(d.w.document.activeElement.matches("[data-grid-range]"), true, "keyboard adjustments must retain slider focus");
  } finally { d.dom.window.close(); }
});

test("Accounting bars are segmented at rest, reveal only on click and close on pointer leave without changing data", () => {
  const d = loadDemo();
  try {
    const r = 0, row = d.api.visible[r];
    for (const field of ["technicalAdminMonths", "dataMonths", "reportPreparationMonths"]) {
      const c = d.api.columns.findIndex((col: any) => col.field === field);
      const cell = d.cell(r, c), control = cell.querySelector(".range-control");
      const button = control.querySelector("[data-edit-range]"), slider = control.querySelector(".control-slider");
      assert.equal(button.hidden, false); assert.equal(slider.hidden, true);
      assert.equal(control.querySelectorAll(".summary-months i").length, 12);
      assert.equal(control.querySelectorAll(".summary-months i.on").length, row[field].length);
      button.dispatchEvent(new d.w.MouseEvent("pointerover", { bubbles: true }));
      assert.equal(slider.hidden, true, "hover alone must not reveal the editor");
      button.dispatchEvent(new d.w.MouseEvent("click", { bubbles: true, detail: 1 }));
      assert.equal(button.hidden, true); assert.equal(slider.hidden, false);
      assert.equal(control.querySelector("input").value, String(row[field].length));
      const before = JSON.stringify(d.api.state.rows);
      control.dispatchEvent(new d.w.MouseEvent("pointerout", { bubbles: true, relatedTarget: d.w.document.body }));
      assert.equal(button.hidden, false); assert.equal(slider.hidden, true);
      assert.equal(JSON.stringify(d.api.state.rows), before);
    }
    assert.equal(d.api.state.history.length, 0);
  } finally { d.dom.window.close(); }
});

test("Accounting segmented editor retains drag changes, supports keyboard close, and stays locked for non-PIC", () => {
  const d = loadDemo();
  try {
    const c = d.api.columns.findIndex((col: any) => col.field === "technicalAdminMonths");
    const rowId = d.api.visible[0].id;
    const control = () => d.cell(0, c).querySelector(".range-control");
    control().querySelector("button").dispatchEvent(new d.w.MouseEvent("click", { bubbles: true, detail: 1 }));
    let input = control().querySelector("input");
    input.dispatchEvent(new d.w.MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    input.value = "8"; input.dispatchEvent(new d.w.Event("input", { bubbles: true }));
    input.dispatchEvent(new d.w.MouseEvent("pointerout", { bubbles: true, relatedTarget: d.w.document.body }));
    assert.equal(control().querySelector(".control-slider").hidden, false, "leaving during a drag must not interrupt it");
    input.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    d.w.document.dispatchEvent(new d.w.MouseEvent("pointerup", { bubbles: true }));
    assert.equal(control().querySelector(".control-slider").hidden, true);
    assert.equal(control().querySelectorAll(".summary-months i.on").length, 8);
    assert.equal(d.api.visible.find((row: any) => row.id === rowId).technicalAdminMonths.length, 8);
    d.choose(0, c); d.key("F2");
    assert.equal(control().querySelector(".control-slider").hidden, false);
    control().dispatchEvent(new d.w.MouseEvent("pointerout", { bubbles: true, relatedTarget: d.w.document.body }));
    assert.equal(control().querySelector(".control-slider").hidden, false, "keyboard editing must not require a mouse hover");
    input = control().querySelector("input");
    input.dispatchEvent(new d.w.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
    assert.equal(control().querySelector(".control-slider").hidden, true);
    control().querySelector("button").dispatchEvent(new d.w.MouseEvent("click", { bubbles: true, detail: 1 }));
    input = control().querySelector("input");
    input.value = "2"; input.dispatchEvent(new d.w.Event("input", { bubbles: true }));
    d.w.document.dispatchEvent(new d.w.MouseEvent("pointercancel", { bubbles: true }));
    assert.equal(control().querySelectorAll(".summary-months i.on").length, 8);
    control().querySelector("button").dispatchEvent(new d.w.MouseEvent("click", { bubbles: true, detail: 1 }));
    assert.equal(control().querySelector("input").value, "8", "reopening after cancellation must use the saved value");
    d.actAs("tax-bagus");
    assert.equal(control().querySelector("button").disabled, true);
    control().querySelector("button").dispatchEvent(new d.w.MouseEvent("click", { bubbles: true, detail: 1 }));
    assert.equal(control().querySelector(".control-slider").hidden, true);
    assert.equal(d.api.state.history.length, 0);
  } finally { d.dom.window.close(); }
});

test("Accounting sliders enforce ownership and accept only 0-12 whole months through paste and formula entry", () => {
  const d = loadDemo();
  try {
    const c = d.api.columns.findIndex((col: any) => col.field === "dataMonths");
    d.choose(0, c); d.paste("12");
    assert.equal(d.api.visible[0].dataMonths.length, 12);
    d.paste("0"); assert.equal(d.api.visible[0].dataMonths.length, 0);
    for (const value of ["13", "-1", "2.5", "NaN"]) {
      const before = JSON.stringify(d.api.state.rows); d.paste(value);
      assert.equal(JSON.stringify(d.api.state.rows), before);
      assert.match(d.w.document.getElementById("toast").textContent, /0 to 12/);
    }
    d.actAs("tax-bagus");
    const before = JSON.stringify(d.api.state.rows);
    const slider = d.cell(0, c).querySelector("input");
    assert.equal(slider.disabled, true);
    slider.disabled = false; slider.value = "12";
    slider.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    assert.equal(JSON.stringify(d.api.state.rows), before);
    assert.match(d.w.document.getElementById("toast").textContent, /read-only/);
  } finally { d.dom.window.close(); }
});

test("Accounting NTPE completes atomically, undo restores it, clearing restores prior progress and payment preserves nil", () => {
  const d = loadDemo();
  try {
    const row = d.api.visible[0], id = row.id, before = JSON.stringify(row);
    const payment = d.api.columns.findIndex((col: any) => col.field === "paymentValue");
    const proof = d.api.columns.findIndex((col: any) => col.field === "ntpe");
    d.choose(0, payment); d.paste("-100\tINVALID-PROOF");
    assert.equal(JSON.stringify(row), before, "invalid payment must abort the entire paste including NTPE");
    d.paste("0\t  001234-NTPE  ");
    assert.equal(row.paymentValue, 0); assert.equal(row.ntpe, "001234-NTPE");
    assert.equal(row.progress, "Done");
    assert.equal(d.api.visible.some((item: any) => item.id === id), false);
    const workbook = d.api.buildExportWorkbook(XLSX, { year: 2025, rows: d.api.state.rows.filter((item: any) => item.year === 2025), customColumns: [] });
    const exported = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets.Summary, { range: 4 });
    assert.equal(exported.find(item => item["Annual Work ID"] === id)!["NTPE / submit proof no."], "001234-NTPE");
    assert.equal(exported.find(item => item["Annual Work ID"] === id)!["Payment value (Rp)"], 0);
    assert.deepEqual(Array.from(row.technicalAdminMonths), JSON.parse(before).technicalAdminMonths);
    assert.deepEqual(Array.from(row.reportPreparationMonths), JSON.parse(before).reportPreparationMonths);
    d.w.document.getElementById("undo-button").click();
    assert.equal(JSON.stringify(d.api.visible.find((item: any) => item.id === id)), before);
    d.w.document.getElementById("redo-button").click();
    d.w.document.querySelector('[data-status="complete"]').click();
    let r = d.api.visible.findIndex((item: any) => item.id === id);
    const completed = d.api.visible[r];
    assert.throws(() => d.api.transition(completed, "In Process"), /Clear NTPE/);
    d.choose(r, proof); d.paste(" ");
    assert.equal(completed.ntpe, ""); assert.equal(completed.progress, JSON.parse(before).progress);
    d.w.document.querySelector('[data-status="incomplete"]').click();
    r = d.api.visible.findIndex((item: any) => item.id === id);
    d.choose(r, payment); d.key("Delete");
    assert.equal(d.api.visible[r].paymentValue, "", "unknown amount must remain distinct from nil");
    d.actAs("tax-bagus");
    const snapshot = JSON.stringify(d.api.state.rows);
    d.choose(r, proof); d.paste("FORGED");
    assert.equal(JSON.stringify(d.api.state.rows), snapshot);
  } finally { d.dom.window.close(); }
});
