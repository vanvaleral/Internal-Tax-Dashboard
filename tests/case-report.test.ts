import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import vm from "node:vm";
function fixture(){
  const context:any={window:{},document:{addEventListener(){}},Date,Intl,Set,Map};
  vm.createContext(context);
  for(const file of ["case-workflow-dashboard.js","case-report.js"])vm.runInContext(readFileSync(new URL(`../public/${file}`,import.meta.url),"utf8"),context);
  const base={caseCategory:"Himbauan",stage:"Waiting Client Docs",clientName:"Synthetic Client",letterNumber:"SP2DK-001",taxPic:"Synthetic Tax",accountingPic:"Synthetic ACC",dueDate:"2026-11-10"};
  const workflow=(amount=1000)=>({result:{kind:"BA",date:"2026-11-01",number:"BA-1"},products:[{id:"p1",tax:"PPN",amount,revise:true,filing:null}],schedule:amount?[{id:"s1",productId:"p1",amount,due:"2026-11-06"}]:[],payments:[],revisionTarget:"2026-11-07",final:null});
  const paid=workflow();paid.payments=[{id:"r1",scheduleId:"s1",amount:1000,verified:true,date:"2026-11-02"}] as any;
  const filed=structuredClone(paid);filed.products[0].filing={number:"NTTE-1",date:"2026-11-03"} as any;
  const rows=[{...base,id:"progress"},{...base,id:"payment",workflow:workflow()},{...base,id:"revision",workflow:paid},{...base,id:"awaiting",workflow:filed},{...base,id:"done",workflow:{...filed,final:{number:"SP3-1",date:"2026-11-04"}}}];
  const build=(items:any[]=rows,options={})=>context.window.CaseReports.build(items,{category:"Himbauan",now:"2026-11-05T08:00:00Z",...options});
  return {context,rows,workflow,build,report:context.window.CaseReports,ui:context.window.CaseWorkflowUI};
}
test("case report statuses are exclusive and await final closure before counting Done",()=>{
  const f=fixture(),s=f.build();
  assert.deepEqual(JSON.parse(JSON.stringify(s.counts)),{handled:5,progress:2,payment:1,revision:1,done:1});
  assert.equal(s.rows.find((r:any)=>r.id==="awaiting").status,"Awaiting SP3P2DK");
  assert.equal(s.rows.find((r:any)=>r.id==="payment").target,"2026-11-06");
  assert.equal(s.rows.find((r:any)=>r.id==="revision").balance,0);
  assert.equal(s.counts.handled,s.counts.progress+s.counts.payment+s.counts.revision+s.counts.done);
});
test("unverified receipts, nil results, examination closure and legacy completions stay accurate",()=>{
  const f=fixture(),w=f.workflow();w.payments=[{scheduleId:"s1",amount:1000,verified:false}] as any;
  assert.equal(f.ui.bucket({workflow:w}),"payment");
  const nil=f.workflow(0);nil.products[0].revise=false;
  assert.equal(f.ui.bucket({workflow:nil}),"progress");
  const exam={...f.rows[3],caseCategory:"Pemeriksaan"};
  const s=f.build([exam]);assert.equal(s.rows[0].bucket,"progress");assert.equal(s.rows[0].status,"Ready for closure");
  for(const data of [{stage:"Closed"},{completionDate:"2026-10-31"},{closedAt:"2026-10-31"}])assert.equal(f.ui.bucket(data),"done");
});
test("report excludes archives and unsaved live drafts, deduplicates identities, and keeps numbering",()=>{
  const f=fixture(),s=f.build([...f.rows,f.rows[0],{...f.rows[0],id:"case-draft"},{...f.rows[0],id:"archived",deletedAt:"2026-11-01"}],{numberFor:()=>12});
  assert.equal(s.rows.length,5);assert.equal(s.rows[0].number,12);assert.equal(s.rows[0].balance,null);
  assert.equal(f.build([{...f.rows[0],id:"case-sample"}],{offline:true}).counts.handled,1);
});
test("print document escapes client/filter content, groups statuses, and uses A4 with repeatable headings",()=>{
  const f=fixture(),s=f.build([{...f.rows[0],clientName:'<img src=x onerror="alert(1)">'}],{filters:['Search: <script>alert(1)</script>']});
  const html=f.report.buildHtml(s);
  assert.match(html,/size:A4 landscape/);assert.match(html,/display:table-header-group/);assert.match(html,/break-inside:avoid/);
  assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);assert.doesNotMatch(html,/<script|<img/);
  assert.match(html,/In progress \(1\)/);assert.match(html,/not a finalized monthly snapshot/);
  assert.match(f.report.buildHtml(f.build([])),/No saved cases/);
});
test("Print Report invokes the print dialog once and handles blocked popups without persistence",()=>{
  const f=fixture();let html="",calls=0;
  const popup={opener:{},document:{open(){},write(value:string){html=value;},close(){}},focus(){},print(){calls++;}};
  f.context.window.open=()=>popup;
  assert.equal(f.report.print(f.build()),true);assert.equal(calls,1);assert.equal(popup.opener,null);assert.match(html,/Case Report/);
  f.context.window.open=()=>null;assert.equal(f.report.print(f.build()),false);assert.equal(calls,1);
});
test("latest progress and last case update are printed separately, safely and in WITA",()=>{
  const f=fixture(),s=f.build([{...f.rows[0],version:'v1'}]);
  const data={latestById:{progress:{entry:'<img onerror="x"> Client response received.',creatorName:'ACC PIC',createdAt:'2026-11-04T01:30:00Z',source:'Follow-up'}},lastUpdateById:{progress:{creatorName:'Tax PIC',createdAt:'2026-11-05T07:00:00Z',source:'Case record'}},versionsById:{progress:'v1'}};
  const html=f.report.buildHtml(f.report.withProgress(s,data));
  assert.match(html,/colspan="9"/);assert.match(html,/Latest Progress \/ Last Update/);
  assert.match(html,/Progress: 04\/11\/2026, 09:30 WITA \/ ACC PIC/);assert.match(html,/Last update: 05\/11\/2026, 15:00 WITA \/ Tax PIC/);
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
  assert.throws(()=>f.report.withProgress(s,{...data,versionsById:{progress:'v2'}}),/Cases changed/);
  assert.throws(()=>f.report.withProgress(s,{...data,latestById:{}}),/incomplete/);
});
