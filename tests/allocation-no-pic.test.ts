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
  w.open = () => ({closed:false,opener:{},document:{title:"",body:{textContent:""}}});
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
  for (const file of ["public/vendor/purify.min.js", "public/workspace-sync.js", "public/feature-access.js", "public/annual-sheet-dashboard.js", "public/allocation-report.js"]) w.eval(read(file));
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
  return { dom, w, api, rows, staff, writes, warnings, alerts, confirmations, choose, select, selectAll, bulk,
    fail:() => { fail = true; }, cancelReset:() => { allowReset = false; }, allowReset:() => { allowReset = true; },
    delay:() => { delay = true; }, release:() => { delay = false; releaseSave?.(); }
  };
}

const picCount=(d:any,team:string,pic:string)=>Number(d.w.document.querySelector(`[data-allocation-pic-team="${team}"] [data-allocation-summary-pic="${pic}"] strong`)?.textContent);
const projection=(d:any,team:string,pic:string)=>{
  const node=d.w.document.querySelector(`[data-allocation-pic-team="${team}"] [data-allocation-summary-pic="${pic}"]`);
  assert.ok(node,`${team} summary contains ${pic || "No PIC"}`);
  return {current:Number(node.dataset.allocationCurrent),proposed:Number(node.dataset.allocationProposed),delta:Number(node.dataset.allocationDelta)};
};

const sheetCell = (d:any,id:string,field="acc") => d.w.document.querySelector(`[data-allocation-row="${id}"] [data-allocation-cell="${field}"]`);

test("Allocation PDF preview captures the filtered/sorted draft simulation without applying or mutating clients",async()=>{
  const d=await allocation();try{
    const previews:any[]=[];let release:()=>void=()=>{};
    d.w.AllocationReports.preview=async(snapshot:any)=>{previews.push(snapshot);await new Promise<void>(resolve=>{release=resolve;});};
    d.choose("acc","Dina");d.choose("tax","");
    const before=JSON.stringify(d.api.getClients());
    d.api.state.allocationAccFilter="Ivan";d.api.renderAllocation();
    const button=d.w.document.querySelector("[data-preview-allocation]");button.click();
    assert.equal(previews.length,1);assert.equal(button.disabled,true);button.click();assert.equal(previews.length,1);
    const snapshot=previews[0];assert.equal(snapshot.rows.length,1);assert.equal(snapshot.rows[0].code,"CL-00001");
    assert.equal(snapshot.rows[0].currentAcc,"Ivan");assert.equal(snapshot.rows[0].nextAcc,"Dina");
    assert.equal(snapshot.rows[0].currentTax,"Bagus");assert.equal(snapshot.rows[0].nextTax,"No PIC");assert.equal(snapshot.pending,1);
    assert.equal(snapshot.year,d.api.state.allocationYear);assert.ok(snapshot.filters.includes("ACC: Ivan"));
    assert.equal(snapshot.summary[0].items.find((item:any)=>item.pic==="Dina").proposed,1);
    d.api.state.allocationDrafts["client-00001"].nextAccPic="Ivan";assert.equal(snapshot.rows[0].nextAcc,"Dina","preview is a fixed snapshot, not a live draft reference");
    release();await tick();assert.equal(button.disabled,false);assert.equal(button.textContent,"Preview PDF");
    assert.equal(JSON.stringify(d.api.getClients()),before);assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation preview handles failures and empty filters, and cannot start during Apply",async()=>{
  const d=await allocation();try{
    let calls=0;d.w.AllocationReports.preview=async()=>{calls++;throw new Error("Allow pop-ups to preview.");};
    d.w.document.querySelector("[data-preview-allocation]").click();await tick();
    assert.equal(calls,1);assert.match(d.alerts[0],/pop-ups/);assert.equal(d.w.document.querySelector("[data-preview-allocation]").disabled,false);
    d.api.state.allocationQuery="no matching client";d.api.renderAllocation();
    assert.equal(d.w.document.querySelector("[data-preview-allocation]").disabled,true);
    d.api.state.allocationQuery="";d.api.renderAllocation();d.choose("acc","Dina");
    d.delay();d.w.document.querySelector("[data-apply-allocation]").click();await tick();
    assert.equal(d.w.document.querySelector("[data-preview-allocation]").disabled,true);
    d.w.document.querySelector("[data-preview-allocation]").click();assert.equal(calls,1);
    d.release();await tick();assert.equal(d.w.document.querySelector("[data-preview-allocation]").disabled,false);
  }finally{d.dom.window.close();}
});

function sheetPointer(d:any,cell:any,type="pointerdown",shiftKey=false) {
  cell.dispatchEvent(new d.w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,shiftKey}));
}
function sheetClipboard(d:any,cell:any,type:string,source="") {
  const event=new d.w.Event(type,{bubbles:true,cancelable:true});let copied="";
  Object.defineProperty(event,"clipboardData",{value:{getData:()=>source,setData:(_type:string,value:string)=>{copied=value;}}});
  cell.dispatchEvent(event);return {copied,prevented:event.defaultPrevented};
}

test("Allocation sheet pastes two PIC columns over multiple visible rows as drafts, including blanks",async()=>{
  const d=await allocation();try{
    const ids=[...d.w.document.querySelectorAll(".allocation-sheet [data-allocation-row]")].map((row:any)=>row.dataset.allocationRow);
    const table=d.w.document.querySelector(".allocation-sheet"),wrap=table.parentElement;wrap.scrollLeft=164;wrap.scrollTop=80;
    const input=d.w.document.querySelector(`[data-allocation-acc="${ids[0]}"]`);
    sheetPointer(d,sheetCell(d,ids[0]));
    const before=JSON.stringify(d.api.getClients());
    assert.equal(sheetClipboard(d,sheetCell(d,ids[0]),"paste","  dina  \tdenny\r\nIVAN\t\r\n").prevented,true);
    assert.equal(d.api.state.allocationDrafts[ids[0]].nextAccPic,"Dina");assert.equal(d.api.state.allocationDrafts[ids[0]].nextTaxPic,"Denny");
    assert.equal(d.api.state.allocationDrafts[ids[1]].nextAccPic,"Ivan");assert.equal(d.api.state.allocationDrafts[ids[1]].nextTaxPic,"");
    assert.equal(JSON.stringify(d.api.getClients()),before);assert.equal(d.writes.length,0);
    const stored=JSON.parse(d.w.localStorage.getItem("tax-practice-v2:user-1"));
    assert.deepEqual(stored.ui.allocationDrafts[ids[0]],{nextAccPic:"Dina",nextTaxPic:"Denny"});
    assert.equal(d.w.document.querySelector(".allocation-sheet"),table);assert.equal(table.parentElement,wrap);
    assert.equal(d.w.document.querySelector(`[data-allocation-acc="${ids[0]}"]`),input,"normal edits keep native editors mounted");
    assert.equal(wrap.scrollLeft,164);assert.equal(wrap.scrollTop,80);
    assert.equal(d.w.document.querySelectorAll("[data-allocation-cell].is-pending").length,3);
    assert.deepEqual(projection(d,"tax",""),{current:0,proposed:1,delta:1});
    assert.match(d.w.document.querySelector("[data-allocation-sheet-message]").textContent,/4 cell\(s\) staged/);
    assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation range selection copies TSV, fills one PIC down a range, and retains focus through edits",async()=>{
  const d=await allocation();try{
    const cells=[...d.w.document.querySelectorAll('[data-allocation-cell="acc"]')];
    sheetPointer(d,cells[0]);sheetPointer(d,cells[1],"pointerdown",true);sheetPointer(d,cells[1],"pointerup");
    assert.equal(d.w.document.querySelectorAll(".allocation-range-selected").length,2);
    const focused=d.w.document.activeElement;
    sheetClipboard(d,cells[0],"paste","Dina");
    assert.ok(Object.values(d.api.state.allocationDrafts).every((draft:any)=>draft.nextAccPic==="Dina"));
    assert.equal(sheetClipboard(d,cells[0],"copy").copied,"Dina\r\nDina");
    assert.equal(d.w.document.activeElement,focused);
    assert.equal(d.w.document.querySelectorAll(".allocation-range-selected").length,2);
    const table=d.w.document.querySelector(".allocation-sheet");d.choose("tax","Denny");
    assert.equal(d.w.document.querySelector(".allocation-sheet"),table);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation drag and keyboard selection cover both next PIC columns; blank fills clear only that range",async()=>{
  const d=await allocation();try{
    const acc=[...d.w.document.querySelectorAll('[data-allocation-cell="acc"]')],tax=[...d.w.document.querySelectorAll('[data-allocation-cell="tax"]')];
    sheetPointer(d,acc[0]);sheetPointer(d,tax[1],"pointermove");sheetPointer(d,tax[1],"pointerup");
    assert.equal(d.w.document.querySelectorAll(".allocation-range-selected").length,4);
    const copied=sheetClipboard(d,acc[0],"copy").copied;assert.equal(copied.split("\r\n").length,2);assert.ok(copied.includes("\t"));
    sheetClipboard(d,acc[0],"paste","No PIC");
    assert.ok(Object.values(d.api.state.allocationDrafts).every((draft:any)=>draft.nextAccPic===""&&draft.nextTaxPic===""));
    assert.equal(d.w.document.querySelectorAll(".allocation-range-selected").length,4);
    acc[0].dispatchEvent(new d.w.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
    assert.equal(d.w.document.querySelectorAll(".allocation-range-selected").length,0);
    acc[0].dispatchEvent(new d.w.KeyboardEvent("keydown",{key:"ArrowDown",shiftKey:true,bubbles:true,cancelable:true}));
    assert.equal(d.w.document.querySelectorAll(".allocation-range-selected").length,2);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation rejects invalid PICs, wrong divisions, malformed/overflow ranges atomically",async()=>{
  const d=await allocation();try{
    const cell=d.w.document.querySelector("[data-allocation-cell]");
    for(const source of ["Dina\tBagus\nUnknown PIC\tDenny","Bagus","Dina\tDenny\textra","Ivan\nDina\nIvan","Ivan\tBagus\nDina",'"Ivan']){
      sheetPointer(d,cell);sheetClipboard(d,cell,"paste",source);
      assert.equal(Object.keys(d.api.state.allocationDrafts).length,0,source);
      assert.equal(d.w.document.querySelector("[data-allocation-sheet-message]").dataset.error,"true",source);
    }
    sheetPointer(d,cell);sheetClipboard(d,cell,"paste","Dina");const before=JSON.stringify(d.api.state.allocationDrafts);
    sheetClipboard(d,cell,"paste","Ivan\tBagus\nNot a person\tDenny");assert.equal(JSON.stringify(d.api.state.allocationDrafts),before);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation rejects ambiguous active staff names and more than 250 clipboard rows",async()=>{
  const d=await allocation();try{
    d.staff.push({id:"acc-duplicate",display_name:"Dina",full_name:"Other Dina",team_division:"Accounting Team",directory_active:true});
    await d.api.loadStaffDirectory(true);d.api.renderAllocation();
    const cell=d.w.document.querySelector("[data-allocation-cell]");sheetClipboard(d,cell,"paste","Dina");
    assert.match(d.w.document.querySelector("[data-allocation-sheet-message]").textContent,/ambiguous/);
    assert.equal(Object.keys(d.api.state.allocationDrafts).length,0);
    sheetClipboard(d,cell,"paste",Array(251).fill("Ivan").join("\n"));
    assert.match(d.w.document.querySelector("[data-allocation-sheet-message]").textContent,/250/);
    assert.equal(Object.keys(d.api.state.allocationDrafts).length,0);assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation paste follows filtered/sorted client IDs and never edits hidden clients or current fields",async()=>{
  const d=await allocation();try{
    const order=d.w.document.getElementById("allocation-order");order.value="oldest";order.dispatchEvent(new d.w.Event("change",{bubbles:true}));
    sheetClipboard(d,d.w.document.querySelector('[data-allocation-cell="acc"]'),"paste","Dina\nIvan");
    assert.equal(d.api.state.allocationDrafts["client-00002"].nextAccPic,"Dina");assert.equal(d.api.state.allocationDrafts["client-00001"].nextAccPic,"Ivan");
    const filter=d.w.document.getElementById("allocation-tax-filter");filter.value="__no_pic__";filter.dispatchEvent(new d.w.Event("change",{bubbles:true}));
    assert.equal(d.w.document.querySelectorAll("[data-allocation-cell]").length,0);
    const resetFilter=d.w.document.getElementById("allocation-tax-filter");resetFilter.value="all";resetFilter.dispatchEvent(new d.w.Event("change",{bubbles:true}));
    const accFilter=d.w.document.getElementById("allocation-acc-filter");accFilter.value="__no_pic__";accFilter.dispatchEvent(new d.w.Event("change",{bubbles:true}));
    sheetClipboard(d,sheetCell(d,"client-00002","tax"),"paste","Denny");
    assert.equal(d.api.state.allocationDrafts["client-00002"].nextTaxPic,"Denny");assert.equal(d.api.state.allocationDrafts["client-00001"].nextTaxPic,"Bagus");
    assert.equal(d.api.getClients().find((client:any)=>client.id==="client-00002").taxPic,"Bagus");
    assert.equal(d.w.document.querySelectorAll(".allocation-sheet td[tabindex]").length,2,"only Next PIC columns are sheet editors");
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation clipboard respects leadership/save locks and Apply submits one audited batch",async()=>{
  const denied=await allocation(false,"associate");try{
    const cell=denied.w.document.querySelector("[data-allocation-cell]");sheetClipboard(denied,cell,"paste","Dina");
    assert.equal(Object.keys(denied.api.state.allocationDrafts).length,0);assert.equal(denied.writes.length,0);
  }finally{denied.dom.window.close();}
  const d=await allocation();try{
    const cell=d.w.document.querySelector("[data-allocation-cell]");sheetClipboard(d,cell,"paste","Dina\tDenny\nIvan\tNo PIC");
    d.delay();d.w.document.querySelector("[data-apply-allocation]").click();await tick();
    const before=JSON.stringify(d.api.state.allocationDrafts);sheetClipboard(d,d.w.document.querySelector("[data-allocation-cell]"),"paste","No PIC");
    assert.equal(JSON.stringify(d.api.state.allocationDrafts),before);assert.equal(d.writes.length,1);
    d.release();await tick();assert.equal(d.writes[0].changes.length,2);assert.equal(Object.keys(d.api.state.allocationDrafts).length,0);
    assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation rebuilds only its sheet when draft-sensitive sort/filter membership changes",async()=>{
  const d=await allocation();try{
    d.api.state.sorts.allocation={key:"nextAccPic",dir:"asc"};d.api.renderAllocation();
    const before=d.w.document.querySelector(".allocation-sheet"),shell=d.w.document.querySelector(".global-topbar");assert.ok(shell);
    before.parentElement.scrollLeft=190;
    const anchor=sheetCell(d,"client-00002");sheetPointer(d,anchor);sheetClipboard(d,anchor,"paste","Dina");
    // Blank sorts before Ivan; Dina still sorts before Ivan, so no replacement is needed.
    assert.equal(d.w.document.querySelector(".allocation-sheet"),before);
    d.choose("acc","Ivan","client-00002");d.choose("acc","Dina","client-00001");
    const ids=[...d.w.document.querySelectorAll(".allocation-sheet [data-allocation-row]")].map((row:any)=>row.dataset.allocationRow);
    assert.deepEqual(ids,["client-00001","client-00002"]);assert.notEqual(d.w.document.querySelector(".allocation-sheet"),before);
    assert.equal(d.w.document.querySelector(".allocation-sheet").parentElement.scrollLeft,190);
    assert.equal(d.w.document.querySelector(".global-topbar"),shell);
    d.api.state.allocationShowChangedOnly=true;d.api.renderAllocation();
    assert.equal(d.w.document.querySelectorAll(".allocation-sheet [data-allocation-row]").length,2);
    sheetClipboard(d,sheetCell(d,"client-00001"),"paste","Ivan");
    assert.equal(d.w.document.querySelectorAll(".allocation-sheet [data-allocation-row]").length,1);
    assert.equal(d.w.document.querySelector(".allocation-sheet [data-allocation-row]").dataset.allocationRow,"client-00002");
    assert.equal(d.w.document.querySelectorAll(".allocation-range-selected").length,0);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation simulates outgoing/incoming ACC and Tax counts immediately without changing saved clients",async()=>{
  for(const mobile of [false,true]){
    const d=await allocation(mobile);try{
      const before=JSON.stringify(d.api.getClients());
      d.choose("acc","Dina");d.choose("tax","Denny");
      assert.deepEqual(projection(d,"acc","Ivan"),{current:1,proposed:0,delta:-1});assert.deepEqual(projection(d,"acc","Dina"),{current:0,proposed:1,delta:1});
      assert.deepEqual(projection(d,"tax","Bagus"),{current:2,proposed:1,delta:-1});assert.deepEqual(projection(d,"tax","Denny"),{current:0,proposed:1,delta:1});
      assert.match(d.w.document.querySelector(".allocation-overview").textContent,/Draft simulation/);
      assert.match(d.w.document.querySelector('[data-allocation-pic-team="acc"]').textContent,/Saved.*Proposed/);
      assert.ok(d.w.document.querySelector('[data-allocation-summary-pic="Dina"] [data-allocation-simulated-count]'));
      assert.equal(JSON.stringify(d.api.getClients()),before);assert.equal(d.writes.length,0);
      for(const team of ["acc","tax"]){
        const chips=[...d.w.document.querySelectorAll(`[data-allocation-pic-team="${team}"] [data-allocation-summary-pic]`)];
        assert.equal(chips.reduce((sum:number,node:any)=>sum+Number(node.dataset.allocationCurrent),0),2);
        assert.equal(chips.reduce((sum:number,node:any)=>sum+Number(node.dataset.allocationProposed),0),2);
      }
      d.choose("acc","Ivan");d.choose("tax","Bagus");
      assert.equal(d.w.document.querySelector("[data-allocation-simulated-count]"),null);
      assert.deepEqual(projection(d,"acc","Ivan"),{current:1,proposed:1,delta:0});assert.equal(d.writes.length,0);
      assert.deepEqual(d.warnings,[]);
    }finally{d.dom.window.close();}
  }
});

test("Allocation simulation handles No PIC and partial drafts, and resetting removes the preview",async()=>{
  const d=await allocation();try{
    d.choose("acc","");
    assert.deepEqual(projection(d,"acc",""),{current:1,proposed:2,delta:1});assert.deepEqual(projection(d,"acc","Ivan"),{current:1,proposed:0,delta:-1});
    assert.deepEqual(projection(d,"tax","Bagus"),{current:2,proposed:2,delta:0});
    d.choose("tax","");assert.deepEqual(projection(d,"tax",""),{current:0,proposed:1,delta:1});
    d.w.document.querySelector("[data-reset-allocation-drafts]").click();
    assert.deepEqual(projection(d,"acc","Ivan"),{current:1,proposed:1,delta:0});assert.deepEqual(projection(d,"acc",""),{current:1,proposed:1,delta:0});
    assert.equal(d.w.document.querySelector("[data-allocation-simulated-count]"),null);assert.doesNotMatch(d.w.document.querySelector(".allocation-overview").textContent,/Draft simulation/);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("bulk simulation follows the current filter cohort and Apply confirms all pending assignments",async()=>{
  const d=await allocation();try{
    d.selectAll();d.bulk("acc","Dina");assert.deepEqual(projection(d,"acc","Dina"),{current:0,proposed:2,delta:2});assert.deepEqual(projection(d,"acc",""),{current:1,proposed:0,delta:-1});
    d.api.state.allocationAccFilter="__no_pic__";d.api.renderAllocation();
    assert.deepEqual(projection(d,"acc","Dina"),{current:0,proposed:1,delta:1});assert.deepEqual(projection(d,"acc",""),{current:1,proposed:0,delta:-1});
    assert.equal(d.writes.length,0);
    d.w.document.querySelector("[data-apply-allocation]").click();await tick();assert.equal(d.writes.length,1);assert.equal(d.writes[0].changes.length,2);
    d.api.state.allocationAccFilter="all";d.api.renderAllocation();
    assert.deepEqual(projection(d,"acc","Dina"),{current:2,proposed:2,delta:0});assert.equal(d.w.document.querySelector("[data-allocation-simulated-count]"),null);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("a failed Apply retains the simulation and saved counts, while case variants do not create duplicate PICs",async()=>{
  const d=await allocation();try{
    d.choose("acc","Dina");d.fail();d.w.document.querySelector("[data-apply-allocation]").click();await tick();
    assert.deepEqual(projection(d,"acc","Ivan"),{current:1,proposed:0,delta:-1});assert.deepEqual(projection(d,"acc","Dina"),{current:0,proposed:1,delta:1});
    d.api.state.allocationDrafts["client-00001"].nextAccPic=" DINA ";d.api.renderAllocation();assert.deepEqual(projection(d,"acc","Dina"),{current:0,proposed:1,delta:1});
    assert.equal(d.w.document.querySelectorAll('[data-allocation-summary-pic="Dina"]').length,1);assert.equal(d.writes.length,1);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("swapping equal client loads is labelled no net change without hiding pending assignments",async()=>{
  const d=await allocation();try{
    d.rows[1].accounting_pic_name="Dina";d.rows[1].accounting_pic_profile_id="acc-2";
    await d.api.loadSharedClients(true);d.choose("acc","Dina");d.choose("acc","Ivan","client-00002");
    assert.deepEqual(projection(d,"acc","Ivan"),{current:1,proposed:1,delta:0});assert.deepEqual(projection(d,"acc","Dina"),{current:1,proposed:1,delta:0});
    assert.match(d.w.document.querySelector('[data-allocation-pic-team="acc"] .allocation-pic-legend').textContent,/No net change/);
    assert.equal(d.w.document.querySelector("[data-allocation-pending-count]").textContent,"2");assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("compact Allocation summary separates ACC/Tax counts and retains zero-client staff and No PIC on desktop/mobile",async()=>{
  for(const mobile of [false,true]){
    const d=await allocation(mobile);try{
      const summary=d.w.document.querySelector(".allocation-overview");assert.ok(summary);
      assert.equal(summary.querySelectorAll(".metric").length,1,"only Visible Clients remains a large metric");
      assert.doesNotMatch(summary.textContent,/Pending Changes|Last Batch|Leader Scope|Limited Scope/);
      assert.equal(picCount(d,"acc","Ivan"),1);assert.equal(picCount(d,"acc","Dina"),0);assert.equal(picCount(d,"acc",""),1);
      assert.equal(picCount(d,"tax","Bagus"),2);assert.equal(picCount(d,"tax","Denny"),0);assert.equal(picCount(d,"tax",""),0);
      assert.match(summary.textContent,/Current assignments.*filters/i);assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
    }finally{d.dom.window.close();}
  }
});

test("Allocation PIC totals exclude inactive clients and follow engagement, combined PIC and search filters",async()=>{
  const d=await allocation();try{
    const extra=(id:string,status:string,category:string,acc:string,tax:string)=>({id,client_code:id,legal_name:id,status,engagement_type:category,accounting_pic_name:acc,tax_pic_name:tax,created_at:"2026-10-10T00:00:00Z"});
    (d.rows as any[]).push(extra("free-client","Active","free_of_charge","Dina","Denny"),extra("demand-client","Active","on_demand","Ivan",""),extra("inactive-client","Inactive","contract","Ivan","Bagus"));
    await d.api.loadSharedClients(true);d.api.renderAllocation();
    assert.equal(picCount(d,"acc","Ivan"),2);assert.equal(picCount(d,"acc","Dina"),1);assert.equal(picCount(d,"acc",""),1);
    assert.equal(picCount(d,"tax","Bagus"),2);assert.equal(picCount(d,"tax","Denny"),1);assert.equal(picCount(d,"tax",""),1);
    for(const team of ["acc","tax"]){
      const counts=[...d.w.document.querySelectorAll(`[data-allocation-pic-team="${team}"] [data-allocation-summary-pic] strong`)];
      assert.equal(counts.reduce((sum:number,node:any)=>sum+Number(node.textContent),0),4);
    }
    d.api.state.allocationEngagementFilter="contract";d.api.renderAllocation();
    assert.equal(picCount(d,"acc","Ivan"),1);assert.equal(picCount(d,"acc","Dina"),0);assert.equal(picCount(d,"tax","Bagus"),2);
    d.api.state.allocationEngagementFilter="free_of_charge";d.api.renderAllocation();assert.equal(picCount(d,"acc","Dina"),1);assert.equal(picCount(d,"tax","Denny"),1);assert.equal(picCount(d,"tax","Bagus"),0);
    d.api.state.allocationEngagementFilter="on_demand";d.api.renderAllocation();assert.equal(picCount(d,"acc","Ivan"),1);assert.equal(picCount(d,"tax",""),1);
    d.api.state.allocationEngagementFilter="all";d.api.state.allocationAccFilter="Ivan";d.api.state.allocationTaxFilter="Bagus";d.api.renderAllocation();assert.equal(picCount(d,"acc","Ivan"),1);assert.equal(picCount(d,"tax","Bagus"),1);
    d.api.state.allocationAccFilter="all";d.api.state.allocationTaxFilter="all";d.api.state.allocationQuery="Beta";d.api.renderAllocation();assert.equal(picCount(d,"acc",""),1);assert.equal(picCount(d,"tax","Bagus"),1);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation counts use saved PICs until Apply succeeds, not draft replacements",async()=>{
  const d=await allocation();try{
    d.choose("acc","Dina");d.choose("tax","Denny");
    assert.equal(picCount(d,"acc","Ivan"),1);assert.equal(picCount(d,"acc","Dina"),0);assert.equal(picCount(d,"tax","Bagus"),2);assert.equal(picCount(d,"tax","Denny"),0);
    assert.equal(d.w.document.querySelector("[data-allocation-pending-count]").textContent,"1");
    d.w.document.querySelector("[data-apply-allocation]").click();await tick();
    assert.equal(picCount(d,"acc","Ivan"),0);assert.equal(picCount(d,"acc","Dina"),1);assert.equal(picCount(d,"tax","Bagus"),1);assert.equal(picCount(d,"tax","Denny"),1);
    assert.equal(d.writes.length,1);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation summary merges case/whitespace variants without hiding legacy PIC allocations",async()=>{
  const d=await allocation();try{
    const clients=d.api.getClients();clients[0].accountingPic="  IVAN  ";clients[0].taxPic=" BAGUS ";clients[1].taxPic="bagus";
    clients[1].accountingPic="Former PIC";d.api.renderAllocation();
    assert.equal(picCount(d,"acc","Ivan"),1);assert.equal(picCount(d,"acc","Former PIC"),1);assert.equal(picCount(d,"tax","Bagus"),2);
    assert.equal(d.w.document.querySelectorAll('[data-allocation-pic-team="tax"] [data-allocation-summary-pic="Bagus"]').length,1);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation summary includes the full directory and counts the full filtered list, not just rendered rows",async()=>{
  const d=await allocation();try{
    d.staff.push(...Array.from({length:12},(_,i)=>({id:`extra-tax-${i}`,display_name:`Extra Tax ${i}`,full_name:`Extra Tax ${i}`,team_division:"Tax Team",directory_active:true})));
    d.staff.push({id:"inactive-zero",display_name:"Inactive zero",full_name:"Inactive zero",team_division:"Tax Team",directory_active:false});
    (d.rows as any[]).push(...Array.from({length:60},(_,i)=>({id:`extra-client-${i}`,client_code:`CL-EXTRA-${i}`,legal_name:`Client ${i}`,status:"Active",accounting_pic_name:"Ivan",tax_pic_name:"Bagus"})));
    await d.api.loadStaffDirectory(true);await d.api.loadSharedClients(true);d.api.renderAllocation();
    assert.equal(d.w.document.querySelectorAll('[data-allocation-pic-team="tax"] [data-allocation-summary-pic]').length,15,"all 14 Tax PICs plus No PIC, without a top-ten cap");
    assert.equal(picCount(d,"tax","Extra Tax 11"),0);assert.equal(picCount(d,"tax","Bagus"),62);assert.equal(picCount(d,"acc","Ivan"),61);
    assert.equal(d.w.document.querySelector('[data-allocation-summary-pic="Inactive zero"]'),null);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation distribution retains the same client-visibility scope for a non-leadership user",async()=>{
  const d=await allocation(false,"associate");try{
    assert.equal(d.api.allocationRows().length,1);assert.equal(picCount(d,"acc","Ivan"),1);assert.equal(picCount(d,"tax","Bagus"),1);assert.equal(picCount(d,"acc",""),0);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("desktop and mobile Allocation retain No PIC as an explicit pending choice when the other PIC changes", async () => {
  for (const mobile of [false, true]) {
    const d = await allocation(mobile);
    try {
      assert.ok([...d.w.document.querySelector('[data-allocation-acc="client-00001"]').options].some((option: any) => option.value === "" && option.textContent === "No PIC"));
      d.choose("acc", ""); d.choose("tax", "");
      assert.equal(d.w.document.querySelector("#allocation-view [data-allocation-pending-count]").textContent, "1");
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
