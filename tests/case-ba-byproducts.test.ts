import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import taxCatalog from "../public/case-tax-types.js";
import { applyCaseWorkflowAction, CASE_TAX_TYPES } from "../lib/case-workflow.ts";

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const options={category:"Himbauan",actorId:"tax",actorName:"Tax PIC",taxAllowed:true,now:"2026-11-05T08:00:00Z",closed:false};
const product=(extra:any={})=>({tax:"PPN",period:"2025",amount:1000,revise:false,...extra});
const ba=(products:any[])=>({type:"record-result",requestId:randomUUID(),number:"BA-EDIT",date:"2026-11-01",outcome:"Additional tax / revision",text:"Agreed with AR.",paymentTarget:"2026-11-05",revisionTarget:"2026-11-06",products});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test("the shared BA catalog covers central, regional and historical taxes without changing old labels",()=>{
  assert.equal(new Set(CASE_TAX_TYPES).size,CASE_TAX_TYPES.length);
  for(const tax of CASE_TAX_TYPES)assert.ok(tax.length<=80);
  for(const tax of ["PPh Pasal 29","PPh Pasal 21","PPh Pasal 23","PPh Pasal 4 ayat (2)","PPN","PPh Pasal 22","PPh Pasal 26","PPh Pasal 15","PPh Pasal 19","PPnBM","Bea Meterai","PBB P5L","PBB-P2","Pajak Air Permukaan (PAP)","Pajak Sarang Burung Walet","Opsen PKB","Opsen BBNKB","Opsen Pajak MBLB"])assert.ok(CASE_TAX_TYPES.includes(tax),tax);
  assert.equal(CASE_TAX_TYPES.filter(tax=>tax.startsWith("PBJT -")).length,5);
  for(const tax of CASE_TAX_TYPES){
    const result=applyCaseWorkflowAction(null,ba([product({tax})]),options);
    assert.equal(result.products[0].tax,tax);assert.equal(result.schedule[0].amount,1000);
  }
  const html=read("public/demo.html");
  assert.ok(html.indexOf('src="case-tax-types.js"')<html.indexOf('src="case-workflow-dashboard.js"'));
});

test("BA rows preserve stable IDs, allow separate tax periods, and protect recorded payment history",()=>{
  const command=ba([product(),product({period:"2024",amount:2000}),product({tax:"PPnBM",amount:3000})]);
  const saved=applyCaseWorkflowAction(null,command,options);
  assert.equal(new Set(saved.products.map(row=>row.id)).size,3);
  assert.equal(saved.schedule.reduce((sum,row)=>sum+row.amount,0),6000);
  assert.deepEqual(saved.schedule.map(row=>row.productId),saved.products.map(row=>row.id));
  assert.equal(applyCaseWorkflowAction(saved,command,options),saved);
  assert.throws(()=>applyCaseWorkflowAction(saved,ba([product({amount:1})]),options),/already registered/);
  const paid=applyCaseWorkflowAction(saved,{type:"record-payment",requestId:randomUUID(),scheduleId:saved.schedule[1].id,date:"2026-11-03",amount:2000,verified:true,proof:"NTPN"},options);
  assert.equal(paid.payments[0].scheduleId,saved.schedule[1].id);
  assert.equal(saved.payments.length,0);
});

test("custom taxes require an explicit name; duplicate tax/period rows and oversized lists are rejected",()=>{
  const custom=product({tax:taxCatalog.otherValue,customTax:"  Pajak   khusus  "});
  const saved=applyCaseWorkflowAction(null,ba([custom]),options);
  assert.equal(saved.products[0].tax,"Pajak khusus");
  for(const products of [
    [product(),product()], [null], [product({tax:"Unknown"})],
    [product({tax:taxCatalog.otherValue})], [product({tax:taxCatalog.otherValue,customTax:" "})],
    [product({tax:taxCatalog.otherValue,customTax:"a".repeat(81)})],
    [product(),product({tax:taxCatalog.otherValue,customTax:"ppn",period:" 2025 "})],
    [custom,{...custom,customTax:"PAJAK KHUSUS"}],
    Array.from({length:taxCatalog.maxProducts+1},(_,i)=>product({period:String(i)}))
  ])assert.throws(()=>applyCaseWorkflowAction(null,ba(products),options));
  const maximum=Array.from({length:taxCatalog.maxProducts},(_,i)=>product({period:String(i)}));
  assert.equal(applyCaseWorkflowAction(null,ba(maximum),options).products.length,taxCatalog.maxProducts);
});

function dialogFixture(){
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost/demo.html",runScripts:"outside-only"}),w=dom.window as any;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};
  w.eval(read("public/case-tax-types.js"));w.eval(read("public/case-workflow-dashboard.js"));
  const root=w.document.getElementById("root"),item:any={id:"saved-ba",clientName:"Synthetic Client",caseCategory:"Himbauan",taxYear:"2025",workflowAvailable:true,stage:"Working"};
  const writes:any[]=[];let workflow:any=null,fail=false;
  const host={canManage:true,canTax:true,onRefresh(){},async onSave(command:any){
    writes.push(structuredClone(command));
    if(fail)throw Error("Connection interrupted. Retry.");
    workflow=applyCaseWorkflowAction(null,structuredClone(command),options);
  }};
  root.innerHTML=w.CaseWorkflowUI.render(item,'<div class="case-progress-viewport"></div>',host);
  root.querySelector('[data-cwf-action="record-result"]').click();
  const dialog=w.document.getElementById("case-workflow-dialog");
  for(const [name,value] of Object.entries({number:"BA-ROWS",date:"01/11/2026",text:"Agreed",paymentTarget:"05/11/2026",revisionTarget:"06/11/2026"}))dialog.querySelector(`[name="${name}"]`).value=value;
  const field=(name:string)=>dialog.querySelector(`[name="${name}"]`);
  const change=(name:string,value:string)=>{field(name).value=value;field(name).dispatchEvent(new w.Event("change",{bubbles:true}));};
  const submit=async()=>{dialog.querySelector("form").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));await tick();};
  return {dom,w,dialog,writes,field,change,submit,getWorkflow:()=>workflow,setFail:(value:boolean)=>fail=value};
}

test("BA dialog adds/removes editable rows, changes taxes, and submits only the remaining values",async()=>{
  const d=dialogFixture();try{
    assert.deepEqual(JSON.parse(JSON.stringify(d.w.CaseTaxTypes)),JSON.parse(JSON.stringify(taxCatalog)));
    assert.equal(d.dialog.querySelectorAll("[data-cwf-product]").length,1);
    d.change("tax-0","PPh Pasal 22");d.field("amount-0").value="1.000";
    d.dialog.querySelector("[data-cwf-add-product]").click();
    d.change("tax-1","PPN");d.field("amount-1").value="2.000";
    d.dialog.querySelector("[data-cwf-add-product]").click();
    d.change("tax-2","Pajak Air Tanah (PAT)");d.field("amount-2").value="3.000";d.field("revise-2").checked=false;
    d.dialog.querySelector('[data-cwf-product="1"] [data-cwf-remove-product]').click();
    assert.equal(d.dialog.querySelectorAll("[data-cwf-product]").length,2);
    assert.equal(d.field("amount-0").value,"1.000");
    await d.submit();assert.equal(d.dialog.isConnected,false);
    assert.deepEqual(d.getWorkflow().products.map((p:any)=>[p.tax,p.amount]),[["PPh Pasal 22",1000],["Pajak Air Tanah (PAT)",3000]]);
    assert.equal(d.getWorkflow().schedule.reduce((sum:number,row:any)=>sum+row.amount,0),4000);
    assert.deepEqual(Object.keys(d.writes[0]).sort(),["date","number","outcome","paymentTarget","products","requestId","revisionTarget","text","type"].sort());
  }finally{d.dom.window.close();}
});

test("BA dropdown reveals Other only when chosen; failures retain rows and retry the same request",async()=>{
  const d=dialogFixture();try{
    const custom=d.field("customTax-0");assert.equal(custom.disabled,true);
    d.change("tax-0",taxCatalog.otherValue);assert.equal(custom.disabled,false);assert.equal(custom.required,true);
    custom.value="Pajak khusus";d.field("amount-0").value="500";d.setFail(true);
    await d.submit();assert.equal(d.dialog.isConnected,true);assert.equal(custom.value,"Pajak khusus");assert.equal(custom.disabled,false);
    assert.match(d.dialog.querySelector("[data-cwf-error]").textContent,/Connection interrupted/);
    d.setFail(false);await d.submit();assert.equal(d.writes[0].requestId,d.writes[1].requestId);assert.equal(d.getWorkflow().products[0].tax,"Pajak khusus");
  }finally{d.dom.window.close();}
  const e=dialogFixture();try{
    e.change("tax-0",taxCatalog.otherValue);e.field("customTax-0").value="Unused name";
    e.change("tax-0","PPnBM");assert.equal(e.field("customTax-0").disabled,true);assert.equal(e.field("customTax-0").closest("label").hidden,true);
    await e.submit();assert.equal(e.getWorkflow().products[0].tax,"PPnBM");assert.equal("customTax" in e.writes[0].products[0],false);
  }finally{e.dom.window.close();}
});

test("BA dialog supports no-additional-tax without rows and retains invalid duplicate rows for correction",async()=>{
  const d=dialogFixture();try{
    d.change("outcome","No additional tax");d.dialog.querySelector("[data-cwf-remove-product]").click();
    assert.equal(d.field("paymentTarget").required,false);assert.equal(d.field("revisionTarget").required,false);
    d.field("paymentTarget").value="";d.field("revisionTarget").value="";
    await d.submit();assert.equal(d.getWorkflow().products.length,0);assert.equal(d.getWorkflow().schedule.length,0);
  }finally{d.dom.window.close();}
  const e=dialogFixture();try{
    e.dialog.querySelector("[data-cwf-add-product]").click();e.change("tax-1","PPh Pasal 29");
    await e.submit();assert.equal(e.dialog.isConnected,true);assert.match(e.dialog.querySelector("[data-cwf-error]").textContent,/same tax and period/);
    assert.equal(e.dialog.querySelectorAll("[data-cwf-product]").length,2);assert.equal(e.field("tax-1").disabled,false);
    e.change("period-1","2024");await e.submit();assert.equal(e.getWorkflow().products.length,2);
  }finally{e.dom.window.close();}
});
