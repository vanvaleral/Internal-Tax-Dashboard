import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };

async function allocation(mobile = false) {
  const warnings: string[] = [], writes: any[] = [], alerts: string[] = [];
  const vc = new VirtualConsole(); vc.on("jsdomError", error => warnings.push(error.message));
  vc.on("error", (...items: any[]) => warnings.push(items.map(String).join(" ")));
  const dom = new JSDOM(read("public/demo.html"), { url:"http://localhost/demo.html", runScripts:"outside-only", virtualConsole:vc });
  const w = dom.window as any;
  w.localStorage.setItem("tax-practice-v2:user-1", JSON.stringify({ ui:{ currentView:"allocation-view" } }));
  w.matchMedia = (query: string) => ({ matches:mobile && query === "(max-width: 760px)", addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.Headers = Headers; w.Response = Response; w.structuredClone = structuredClone; w.alert = (value: string) => alerts.push(value);
  let fail = false;
  const staff = [
    { id:"tax-1", display_name:"Bagus", full_name:"Bagus", team_division:"Tax Team", directory_active:true },
    { id:"acc-1", display_name:"Ivan", full_name:"Ivan", team_division:"Accounting Team", directory_active:true },
    { id:"acc-2", display_name:"Dina", full_name:"Dina", team_division:"Accounting Team", directory_active:true }
  ];
  const rows = [
    { id:"master-1", client_code:"CL-00001", legal_name:"Individual Alpha", business_form:"Individual", status:"Active", tax_pic_name:"Bagus", tax_pic_profile_id:"tax-1", accounting_pic_name:"Ivan", accounting_pic_profile_id:"acc-1" },
    { id:"master-2", client_code:"CL-00002", legal_name:"Beta", business_form:"PT", status:"Active", tax_pic_name:"Bagus", tax_pic_profile_id:"tax-1", accounting_pic_name:"", accounting_pic_profile_id:null }
  ];
  w.fetch = async (url: string, init: any = {}) => {
    if (url === "/api/clients/allocation") {
      const body = JSON.parse(init.body); writes.push(body);
      if (fail) return { ok:false, status:422, json:async () => ({ error:"Allocation failed." }) };
      for (const change of body.changes) {
        const row = rows.find(item => item.client_code === change.clientCode)!;
        row.accounting_pic_name = change.nextAccPic; row.accounting_pic_profile_id = staff.find(person => person.display_name === change.nextAccPic)?.id || null;
        row.tax_pic_name = change.nextTaxPic; row.tax_pic_profile_id = staff.find(person => person.display_name === change.nextTaxPic)?.id || "";
      }
      return { ok:true, json:async () => ({ updated:body.changes.length }) };
    }
    const body = url === "/api/profile" ? { user:{ id:"user-1" }, profile:{ id:"acc-1", role:"supervisor", display_name:"Ivan", directory_active:true, team_division:"Accounting Team" } }
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
  return { dom, w, api, rows, writes, warnings, alerts, choose, fail:() => { fail = true; } };
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
