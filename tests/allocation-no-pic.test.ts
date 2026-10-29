import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };

async function allocation(mobile = false, role = "supervisor") {
  const warnings: string[] = [], writes: any[] = [], alerts: string[] = [], confirmations: string[] = [];
  const vc = new VirtualConsole(); vc.on("jsdomError", error => warnings.push(error.message));
  vc.on("error", (...items: any[]) => warnings.push(items.map(String).join(" ")));
  const dom = new JSDOM(read("public/demo.html"), { url:"http://localhost/demo.html", runScripts:"outside-only", virtualConsole:vc });
  const w = dom.window as any;
  w.localStorage.setItem("tax-practice-v2:user-1", JSON.stringify({ ui:{ currentView:"allocation-view" } }));
  w.matchMedia = (query: string) => ({ matches:mobile && query === "(max-width: 760px)", addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.Headers = Headers; w.Response = Response; w.structuredClone = structuredClone; w.alert = (value: string) => alerts.push(value);
  let fail = false, allowReset = true, delay = false, releaseSave: (() => void) | undefined;
  w.confirm = (message: string) => { confirmations.push(message); return allowReset; };
  const staff = [
    { id:"tax-1", display_name:"Bagus", full_name:"Bagus", team_division:"Tax Team", directory_active:true },
    { id:"tax-2", display_name:"Denny", full_name:"Denny", team_division:"Tax Team", directory_active:true },
    { id:"acc-1", display_name:"Ivan", full_name:"Ivan", team_division:"Accounting Team", directory_active:true },
    { id:"acc-2", display_name:"Dina", full_name:"Dina", team_division:"Accounting Team", directory_active:true }
  ];
  const rows = [
    { id:"master-1", client_code:"CL-00001", legal_name:"Individual Alpha", business_form:"Individual", status:"Active", tax_pic_name:"Bagus", tax_pic_profile_id:"tax-1", accounting_pic_name:"Ivan", accounting_pic_profile_id:"acc-1", created_at:"2026-10-20T00:00:00Z" },
    { id:"master-2", client_code:"CL-00002", legal_name:"Beta", business_form:"PT", status:"Active", tax_pic_name:"Bagus", tax_pic_profile_id:"tax-1", accounting_pic_name:"", accounting_pic_profile_id:null, created_at:"2026-10-10T00:00:00Z" }
  ];
  w.fetch = async (url: string, init: any = {}) => {
    if (url === "/api/clients/allocation") {
      const body = JSON.parse(init.body); writes.push(body);
      if (delay) await new Promise<void>(resolve => { releaseSave = resolve; });
      if (fail) return { ok:false, status:422, json:async () => ({ error:"Allocation failed." }) };
      for (const change of body.changes) {
        const row = rows.find(item => item.client_code === change.clientCode)!;
        row.accounting_pic_name = change.nextAccPic; row.accounting_pic_profile_id = staff.find(person => person.display_name === change.nextAccPic)?.id || null;
        row.tax_pic_name = change.nextTaxPic; row.tax_pic_profile_id = staff.find(person => person.display_name === change.nextTaxPic)?.id || "";
      }
      return { ok:true, json:async () => ({ updated:body.changes.length }) };
    }
    const body = url === "/api/profile" ? { user:{ id:"user-1" }, profile:{ id:"acc-1", role, display_name:"Ivan", directory_active:true, team_division:"Accounting Team" } }
      : url === "/api/clients" ? { data:rows }
      : url === "/api/staff" ? { staff }
      : { data:[], staff:[], tasks:[], announcements:[] };
    return { ok:true, json:async () => structuredClone(body) };
  };
  for (const file of ["public/vendor/purify.min.js", "public/workspace-sync.js", "public/annual-sheet-dashboard.js"]) w.eval(read(file));
  const script = read("public/demo.html").match(/<script>([\s\S]*?)<\/script>/)![1].replace("    })().catch(error =>", "    window.__allocationTest = { state, renderAllocation, allocationRows, loadSharedClients, loadStaffDirectory, getClients:() => clientMasterClients };\n    })().catch(error =>");
  await w.eval(script); await tick();
  const api = w.__allocationTest; assert.ok(api, warnings.join("\n")); api.state.currentView = "allocation-view"; api.renderAllocation();
  const choose = (field: string, value: string, id = "client-00001") => {
    const select = w.document.querySelector(`#allocation-view [data-allocation-${field}="${id}"]`);
    assert.ok(select); select.value = value; select.dispatchEvent(new w.Event("change", { bubbles:true }));
  };
  const select = (id: string, checked = true) => {
    const input = w.document.querySelector(`[data-allocation-select="${id}"]`); assert.ok(input);
    input.checked = checked; input.dispatchEvent(new w.Event("change", { bubbles:true }));
  };
  const selectAll = (checked = true) => { const input = w.document.querySelector("[data-allocation-select-all]"); input.checked = checked; input.dispatchEvent(new w.Event("change", { bubbles:true })); };
  const bulk = (type: string, value: string) => { const input = w.document.querySelector(`[data-allocation-bulk="${type}"]`); assert.ok(input); input.value = value; input.dispatchEvent(new w.Event("change", { bubbles:true })); };
  return { dom, w, api, rows, writes, warnings, alerts, confirmations, choose, select, selectAll, bulk,
    fail:() => { fail = true; }, cancelReset:() => { allowReset = false; }, allowReset:() => { allowReset = true; },
    delay:() => { delay = true; }, release:() => { delay = false; releaseSave?.(); }
  };
}

test("desktop and mobile Allocation retain No PIC as an explicit pending choice when the other PIC changes", async () => {
  for (const mobile of [false, true]) {
    const d = await allocation(mobile);
    try {
      assert.ok([...d.w.document.querySelector('[data-allocation-acc="client-00001"]').options].some((option: any) => option.value === "" && option.textContent === "No PIC"));
      d.choose("acc", ""); d.choose("tax", "");
      assert.equal(d.w.document.querySelector("#allocation-view .metric:nth-child(2) strong").textContent, "1");
      assert.deepEqual(JSON.parse(JSON.stringify(d.api.state.allocationDrafts["client-00001"])), { nextAccPic:"", nextTaxPic:"" });
      await d.api.loadStaffDirectory(true);
      assert.equal(d.api.state.allocationDrafts["client-00001"].nextAccPic, "");
      assert.equal(d.w.document.querySelector('[data-allocation-acc="client-00001"]').value, "");
      d.api.state.allocationShowChangedOnly = true; d.api.renderAllocation();
      assert.equal(d.w.document.querySelectorAll("[data-allocation-acc]").length, 1);
      assert.ok(d.w.document.querySelector("#allocation-view").textContent.includes(mobile ? "Pending" : "Pending Update"));
      assert.equal(d.writes.length, 0); assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("partial Allocation drafts retain unspecified PICs, and historical current names do not silently display No PIC", async () => {
  const d = await allocation();
  try {
    d.api.state.allocationDrafts["client-00001"] = { nextTaxPic:"Bagus" };
    await d.api.loadStaffDirectory(true); d.api.renderAllocation();
    assert.equal(Object.hasOwn(d.api.state.allocationDrafts["client-00001"], "nextAccPic"), false);
    assert.equal(d.w.document.querySelector('[data-allocation-acc="client-00001"]').value, "Ivan");
    d.api.getClients().find((client: any) => client.id === "client-00001").accountingPic = "Former PIC";
    d.api.renderAllocation();
    assert.equal(d.w.document.querySelector('[data-allocation-acc="client-00001"]').value, "Former PIC");
    assert.equal(d.writes.length, 0); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("Apply saves empty Accounting PIC, retains Tax PIC and shows No PIC after database reload and in the report", async () => {
  const d = await allocation();
  try {
    d.choose("acc", "");
    d.w.document.querySelector("[data-apply-allocation]").click(); await tick();
    assert.equal(d.writes.length, 1);
    assert.deepEqual(d.writes[0].changes, [{ clientCode:"CL-00001", nextTaxPic:"Bagus", nextAccPic:"" }]);
    assert.equal(d.rows[0].accounting_pic_profile_id, null); assert.equal(d.rows[0].tax_pic_profile_id, "tax-1");
    assert.equal(d.w.document.querySelector('[data-allocation-acc="client-00001"]').value, "");
    assert.equal(Object.keys(d.api.state.allocationDrafts).length, 0);
    assert.equal(d.api.state.allocationLastReport[0].previousAccPic, "Ivan");
    assert.equal(d.api.state.allocationLastReport[0].nextAccPic, "");
    assert.ok(d.w.document.querySelector("#allocation-view").textContent.includes("No PIC"));
    const filter = d.w.document.getElementById("allocation-acc-filter"); filter.value = "__no_pic__"; filter.dispatchEvent(new d.w.Event("change", { bubbles:true }));
    assert.equal(d.w.document.querySelectorAll("[data-allocation-acc]").length, 2);
    assert.deepEqual(d.alerts, []); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("failed Allocation saves retain an empty draft for retry rather than silently restoring its previous PIC", async () => {
  const d = await allocation();
  try {
    d.choose("acc", ""); d.fail();
    d.w.document.querySelector("[data-apply-allocation]").click(); await tick();
    assert.equal(d.writes.length, 1); assert.equal(d.rows[0].accounting_pic_name, "Ivan");
    assert.equal(d.api.state.allocationDrafts["client-00001"].nextAccPic, "");
    assert.equal(d.api.state.allocationDrafts["client-00001"].nextTaxPic, "Bagus");
    assert.equal(d.w.document.querySelector('[data-allocation-acc="client-00001"]').value, "");
    assert.deepEqual(d.alerts, []);
  } finally { d.dom.window.close(); }
});

test("Allocation entry-order control works on desktop/mobile and persists through PIC drafts and client reloads", async () => {
  for (const mobile of [false, true]) {
    const d = await allocation(mobile);
    try {
      const order = (value: string) => { const select = d.w.document.getElementById("allocation-order"); select.value = value; select.dispatchEvent(new d.w.Event("change", { bubbles:true })); };
      const ids = () => [...d.w.document.querySelectorAll("#allocation-view [data-allocation-acc]")].map((input: any) => input.dataset.allocationAcc);
      assert.equal(d.w.document.getElementById("allocation-order").value, "form");
      order("oldest"); assert.deepEqual(ids(), ["client-00002", "client-00001"]);
      assert.equal(d.api.getClients().find((client: any) => client.id === "client-00001").createdAt, "2026-10-20T00:00:00Z");
      d.choose("acc", ""); await d.api.loadSharedClients(true); d.api.renderAllocation();
      assert.deepEqual(ids(), ["client-00002", "client-00001"]);
      assert.equal(d.api.state.allocationDrafts["client-00001"].nextAccPic, "");
      const stored = JSON.parse(d.w.localStorage.getItem("tax-practice-v2:user-1"));
      assert.deepEqual(stored.ui.sorts.allocation, { key:"createdAt", dir:"asc" });
      order("newest"); assert.deepEqual(ids(), ["client-00001", "client-00002"]);
      if (!mobile) {
        d.w.document.querySelector('[data-sort-scope="allocation"][data-sort-key="name"]').click();
        assert.equal(d.w.document.getElementById("allocation-order").value, "column");
      }
      order("form"); assert.equal(d.api.state.sorts.allocation.key, "form");
      assert.equal(d.writes.length, 0); assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("Allocation row selection stages one PIC for multiple clients without saving or changing the other PIC draft", async () => {
  for (const mobile of [false, true]) {
    const d = await allocation(mobile);
    try {
      assert.equal(d.w.document.querySelector("[data-reset-allocation-drafts]").disabled, true);
      d.select("client-00001");
      assert.equal(d.w.document.querySelector("[data-allocation-select-all]").indeterminate, true);
      d.select("client-00002"); d.bulk("acc", "Dina");
      assert.equal(d.api.state.allocationDrafts["client-00001"].nextAccPic, "Dina");
      assert.equal(d.api.state.allocationDrafts["client-00002"].nextAccPic, "Dina");
      assert.equal(d.rows[0].accounting_pic_name, "Ivan"); assert.equal(d.rows[1].accounting_pic_name, "");
      d.choose("tax", "", "client-00001"); d.bulk("acc", "Ivan");
      assert.equal(d.api.state.allocationDrafts["client-00001"].nextTaxPic, "");
      d.bulk("tax", "Denny");
      assert.equal(d.api.state.allocationDrafts["client-00002"].nextTaxPic, "Denny");
      assert.equal(d.api.state.allocationDrafts["client-00002"].nextAccPic, "Ivan");
      assert.equal(d.w.document.querySelector("[data-reset-allocation-drafts]").disabled, false);
      assert.equal(d.writes.length, 0);
      d.w.document.querySelector("[data-clear-allocation-selection]").click();
      assert.equal(d.api.state.allocationSelection.length, 0);
      assert.equal(d.api.state.allocationDrafts["client-00002"].nextAccPic, "Ivan");
      assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("Select all affects only visible clients, filtered-out selections are removed, and sorting retains client identity", async () => {
  const d = await allocation();
  try {
    d.selectAll();
    assert.equal(d.api.state.allocationSelection.length, 2);
    d.w.document.querySelector('[data-sort-scope="allocation"][data-sort-key="name"]').click();
    assert.equal(d.api.state.allocationSelection.length, 2);
    assert.ok([...d.w.document.querySelectorAll("[data-allocation-select]")].every((input: any) => input.checked));
    const filter = d.w.document.getElementById("allocation-acc-filter"); filter.value = "__no_pic__"; filter.dispatchEvent(new d.w.Event("change", { bubbles:true }));
    assert.equal(d.api.state.allocationSelection.join(","), "client-00002");
    d.selectAll(); d.bulk("acc", "Dina");
    assert.equal(d.api.state.allocationDrafts["client-00001"], undefined);
    assert.equal(d.api.state.allocationDrafts["client-00002"].nextAccPic, "Dina");
    d.selectAll(false); assert.equal(d.api.state.allocationSelection.length, 0);
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("bulk No PIC is saved only on Apply and retains an independent Tax assignment and yearly report", async () => {
  const d = await allocation(true);
  try {
    d.selectAll(); d.bulk("tax", "Denny"); d.bulk("acc", "");
    const staleHistory = d.w.history.state;
    assert.equal(d.writes.length, 0);
    d.w.document.querySelector("[data-apply-allocation]").click(); await tick();
    assert.equal(d.writes.length, 1); assert.equal(d.writes[0].changes.length, 2);
    assert.ok(d.writes[0].changes.every((change: any) => change.nextTaxPic === "Denny" && change.nextAccPic === ""));
    assert.equal(d.api.state.allocationSelection.length, 0);
    assert.equal(Object.keys(d.api.state.allocationDrafts).length, 0);
    assert.equal(d.api.state.allocationLastReport.length, 2);
    assert.equal(d.api.state.allocationApplying, false);
    assert.equal(d.rows[0].accounting_pic_profile_id, null);
    d.w.dispatchEvent(new d.w.PopStateEvent("popstate", { state:staleHistory }));
    assert.equal(Object.keys(d.api.state.allocationDrafts).length, 0, "browser Back must not restore applied drafts");
    assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("Reset unsaved confirms and discards all drafts including hidden clients without modifying saved assignments or history", async () => {
  const d = await allocation();
  try {
    d.selectAll(); d.bulk("acc", "Dina");
    d.api.state.allocationLastReport = [{ clientName:"Previous saved batch", nextAccPic:"Ivan", allocationYear:2025 }];
    const report = JSON.stringify(d.api.state.allocationLastReport);
    const filter = d.w.document.getElementById("allocation-acc-filter"); filter.value = "__no_pic__"; filter.dispatchEvent(new d.w.Event("change", { bubbles:true }));
    const staleHistory = d.w.history.state;
    d.cancelReset(); d.w.document.querySelector("[data-reset-allocation-drafts]").click();
    assert.equal(Object.keys(d.api.state.allocationDrafts).length, 2);
    d.allowReset(); d.w.document.querySelector("[data-reset-allocation-drafts]").click();
    assert.equal(d.confirmations.length, 2); assert.match(d.confirmations[0], /hidden by filters/);
    assert.equal(Object.keys(d.api.state.allocationDrafts).length, 0);
    assert.equal(d.api.state.allocationSelection.length, 0);
    assert.equal(d.api.state.allocationAccFilter, "__no_pic__");
    assert.equal(JSON.stringify(d.api.state.allocationLastReport), report);
    assert.equal(d.rows[0].accounting_pic_name, "Ivan"); assert.equal(d.rows[1].accounting_pic_name, "");
    const stored = JSON.parse(d.w.localStorage.getItem("tax-practice-v2:user-1"));
    assert.deepEqual(stored.ui.allocationDrafts, {});
    assert.equal(Object.hasOwn(stored.ui, "allocationSelection"), false);
    assert.equal(d.writes.length, 0); assert.deepEqual(d.warnings, []);
    d.w.dispatchEvent(new d.w.PopStateEvent("popstate", { state:staleHistory }));
    assert.equal(Object.keys(d.api.state.allocationDrafts).length, 0, "browser Back must not restore discarded drafts");
  } finally { d.dom.window.close(); }
});

test("Allocation Apply locks editing, reset and duplicate saves until completion, then retains failed drafts for reset", async () => {
  const d = await allocation();
  try {
    d.selectAll(); d.bulk("acc", "Dina"); d.delay(); d.fail();
    d.w.document.querySelector("[data-apply-allocation]").click(); await tick();
    assert.equal(d.api.state.allocationApplying, true); assert.equal(d.writes.length, 1);
    const leaving = new d.w.Event("beforeunload", { cancelable:true }); d.w.dispatchEvent(leaving); assert.equal(leaving.defaultPrevented, true);
    assert.equal(d.w.document.querySelector("[data-reset-allocation-drafts]").disabled, true);
    assert.equal(d.w.document.querySelector("[data-apply-allocation]").disabled, true);
    assert.ok([...d.w.document.querySelectorAll("[data-allocation-select], [data-allocation-acc], [data-allocation-bulk]")].every((input: any) => input.disabled));
    d.bulk("acc", ""); d.choose("tax", "");
    d.w.document.querySelector("[data-reset-allocation-drafts]").dispatchEvent(new d.w.MouseEvent("click", { bubbles:true }));
    d.w.document.querySelector("[data-apply-allocation]").dispatchEvent(new d.w.MouseEvent("click", { bubbles:true }));
    assert.equal(d.api.state.allocationDrafts["client-00001"].nextAccPic, "Dina");
    assert.equal(d.writes.length, 1); assert.equal(d.confirmations.length, 0);
    d.release(); await tick();
    assert.equal(d.api.state.allocationApplying, false);
    assert.equal(d.w.document.querySelector("[data-reset-allocation-drafts]").disabled, false);
    assert.equal(d.api.state.allocationDrafts["client-00001"].nextAccPic, "Dina");
    d.w.document.querySelector("[data-reset-allocation-drafts]").click();
    assert.equal(Object.keys(d.api.state.allocationDrafts).length, 0);
    assert.equal(d.api.state.syncIssues.some((issue: any) => issue.scope === "PIC allocation"), false);
    assert.equal(d.rows[0].accounting_pic_name, "Ivan");
  } finally { d.dom.window.close(); }
});

test("non-leadership cannot stage bulk PIC changes or reset drafts through Allocation controls", async () => {
  const d = await allocation(false, "staff");
  try {
    assert.ok([...d.w.document.querySelectorAll("[data-allocation-select], [data-allocation-select-all], [data-allocation-acc], [data-reset-allocation-drafts], [data-apply-allocation]")].every((input: any) => input.disabled));
    d.api.state.allocationDrafts["client-00001"] = { nextAccPic:"Dina" };
    d.select("client-00001");
    d.w.document.querySelector("[data-reset-allocation-drafts]").dispatchEvent(new d.w.MouseEvent("click", { bubbles:true }));
    assert.equal(d.api.state.allocationSelection.length, 0);
    assert.equal(d.api.state.allocationDrafts["client-00001"].nextAccPic, "Dina");
    assert.equal(d.writes.length, 0); assert.equal(d.confirmations.length, 0);
  } finally { d.dom.window.close(); }
});
