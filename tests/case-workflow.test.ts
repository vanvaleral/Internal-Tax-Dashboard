import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import * as domain from "../lib/case-workflow.ts";
import {loadRoute,mockDatabase,request} from "./route-harness.ts";
const options={category:"Himbauan",actorId:"tax",actorName:"Tax PIC",taxAllowed:true,now:"2026-11-05T08:00:00Z",closed:false};
const command=(type: string,extra: any={})=>({type,requestId:randomUUID(),...extra});
const ba=()=>command("record-result",{number:"BA-001",date:"2026-11-01",outcome:"Additional tax / revision",text:"Agreed with AR.",paymentTarget:"2026-11-05",revisionTarget:"2026-11-06",products:[{tax:"PPh Pasal 29",period:"2025",amount:1000,revise:true}]});
const run=(w: domain.CaseWorkflow|null,c: any,extra={})=>domain.applyCaseWorkflowAction(w,c,{...options,...extra});

test("BA products -> verified payment -> revision -> SP3P2DK; history and IDs persist",()=>{
  const c=ba(),w=run(null,c);
  assert.equal(w.result!.kind,"BA");assert.equal(w.schedule[0].amount,1000);
  assert.equal(run(w,c),w,"same request is idempotent");
  assert.throws(()=>run(w,command("record-filing",{productId:w.products[0].id,number:"NTTE",date:"2026-11-05"})),/verified paid/);
  const paid=run(w,command("record-payment",{scheduleId:w.schedule[0].id,amount:1000,proof:"NTPN",date:"2026-11-03",verified:true}));
  assert.equal(domain.caseWorkflowStatus(paid).supervisorAttention,true);
  assert.throws(()=>run(paid,command("record-final",{number:"SP3",date:"2026-11-05"})),/required revisions/);
  const filed=run(paid,command("record-filing",{productId:w.products[0].id,number:"NTTE",date:"2026-11-04"}));
  assert.equal(domain.caseWorkflowStatus(filed).executed,true);
  assert.throws(()=>run(filed,command("record-final",{number:"SP3",date:"2026-11-03"})),/cannot precede/);
  const closed=run(filed,command("record-final",{number:"SP3",date:"2026-11-05"}));
  assert.equal(closed.events.length,4);assert.equal(closed.final!.number,"SP3");
  assert.throws(()=>run(closed,ba()),/already closed/);
  assert.equal(w.payments.length,0,"input state is immutable");
});
test("result validation is atomic, duplicate products and unsafe amounts are rejected",()=>{
  for(const change of [
    {products:[{tax:"PPN",period:"2025",amount:-1}]},
    {products:[{tax:"PPN",period:"2025",amount:1.1}]},
    {products:[{tax:"PPN",period:"2025",amount:1},{tax:"PPN",period:"2025",amount:2}]},
    {date:"2026-02-30"},{date:"2026-11-06"},{outcome:"No additional tax"},
    {paymentTarget:"2026-10-31"},{products:[{tax:"Unknown",period:"2025",amount:1}]}
  ]) assert.throws(()=>run(null,{...ba(),...change}));
  assert.equal(run(null,{...ba(),outcome:"No additional tax",products:[]}).schedule.length,0);
});
test("pending receipts reserve balance; verification is not another receipt; history cannot be replanned",()=>{
  const w=run(null,ba());
  const pending=run(w,command("record-payment",{scheduleId:w.schedule[0].id,amount:1000,date:"2026-11-03",verified:false}));
  assert.equal(domain.caseWorkflowStatus(pending).settled,false);
  assert.throws(()=>run(pending,command("record-payment",{scheduleId:w.schedule[0].id,amount:1,date:"2026-11-03",verified:false})),/exceeds/);
  assert.throws(()=>run(pending,command("set-plan",{productId:w.products[0].id,count:3,date:"2026-11-05"})),/Receipts already exist/);
  assert.throws(()=>run(pending,command("verify-payment",{paymentId:pending.payments[0].id,proof:""})),/reference/);
  const verified=run(pending,command("verify-payment",{paymentId:pending.payments[0].id,proof:"NTPN"}));
  assert.equal(verified.payments.length,1);assert.equal(domain.caseWorkflowStatus(verified).settled,true);
});
test("instalments preserve totals and month ends; Tax-only actions enforce assigned-role guard",()=>{
  const w=run(null,ba());
  const plan=run(w,command("set-plan",{productId:w.products[0].id,count:3,date:"2027-01-31"}));
  assert.deepEqual(plan.schedule.map(s=>s.due),["2027-01-31","2027-02-28","2027-03-31"]);
  assert.deepEqual(plan.schedule.map(s=>s.amount),[333,333,334]);
  for(const type of ["record-payment","verify-payment","record-filing","record-final"])assert.throws(()=>run(w,command(type),{taxAllowed:false}),/assigned Tax PIC/);
  assert.equal(domain.canAccessCaseWorkflow({id:"other",role:"staff"},{tax_pic_profile_id:"tax",accounting_pic_profile_id:"acc"}),false);
});
test("Pemeriksaan response and SKP stay distinct; no revision is implied by tax assessment",()=>{
  const response=run(null,command("record-response",{number:"SPHP response",date:"2026-11-01"}),{category:"Pemeriksaan"});
  assert.equal(response.result,null);
  assert.throws(()=>run(response,ba(),{category:"Pemeriksaan"}),/Record SPHP/);
  const closed=run(response,command("close-examination",{number:"SPHP",date:"2026-11-01"}),{category:"Pemeriksaan"});
  const skp=run(closed,command("record-assessment",{kind:"SKP",number:"SKP",date:"2026-11-02",tax:"PPN",period:"2025",principal:0,penalty:0}),{category:"Pemeriksaan",closed:true});
  assert.equal(skp.result!.kind,"SPHP");assert.equal(domain.caseWorkflowStatus(skp).executed,true);assert.equal(skp.final,null);assert.equal(skp.products[0].revise,false);
});
function fixture(id="tax",role="staff",migrated=true){
  const row:any={id:"case",case_category:"Himbauan",stage:"Working",updated_at:"v1",tax_pic_profile_id:"tax",accounting_pic_profile_id:"acc",...(migrated?{case_workflow:null}:{})};
  const db=mockDatabase({tax_cases:[row]});
  const route=loadRoute("app/api/cases/workflow/route.ts",{"@/lib/access":{currentActor:async()=>({profile:{id,role,full_name:"Synthetic PIC"},admin:db}),isLeadership:(role:string)=>role!=="staff"},"@/lib/case-workflow":domain});
  const save=(c:any,version="v1")=>route.PATCH(request({id:"case",version,command:c}));
  return {db,row,save};
}
test("workflow route denies another PIC, archived cases and pre-migration writes",async()=>{
  const outsider=fixture("other");assert.equal((await outsider.save(ba())).status,403);assert.equal(outsider.row.case_workflow,null);
  const archived=fixture();archived.row.deleted_at="2026-11-04";assert.equal((await archived.save(ba())).status,403);
  assert.equal((await fixture("tax","staff",false).save(ba())).status,503);
  const acc=fixture("acc");assert.equal((await acc.save(ba())).status,200);
  const rejected=await acc.save(command("record-payment"));assert.equal(rejected.status,403);
});
test("workflow route uses compare-and-swap; concurrent changes are not overwritten",async()=>{
  const d=fixture();assert.equal((await d.save(ba(),"stale")).status,409);
  d.db.beforeWrite=()=>{d.row.updated_at="someone-else";};
  assert.equal((await d.save(ba())).status,409);assert.equal(d.row.case_workflow,null);
});
test("workflow route replays a successful request without duplicating the event",async()=>{
  const d=fixture(),c=ba(),saved=await d.save(c);assert.equal(saved.status,200);
  assert.equal(saved.headers['Cache-Control'],'private, no-store');assert.match(saved.headers['Server-Timing'],/^auth;dur=\d+,data;dur=\d+$/);
  d.row.updated_at="v2";
  const result=await d.save(c);assert.equal(result.status,200);assert.equal(result.body.replayed,true);
  assert.match(result.headers['Server-Timing'],/^auth;dur=\d+,data;dur=\d+$/);
  assert.equal(d.row.case_workflow.events.length,1);
  assert.equal((await d.save({...c,text:"Different result"})).status,409);
});
test("ordinary case edits cannot bypass managed closure or change the case category",async()=>{
  const db=mockDatabase({tax_cases:[{id:"case",client_id:"client",tax_pic_profile_id:"tax",updated_at:"v1",case_category:"Himbauan",completion_date:null,stage:"Working",case_workflow:run(null,ba())}],client_master:[{id:"client",legal_name:"Synthetic Client",tax_pic_profile_id:"tax"}]});
  const route=loadRoute("app/api/cases/route.ts",{
    "@/lib/access":{currentActor:async()=>({profile:{id:"tax",role:"staff"},admin:db}),isLeadership:()=>false},
    "@/lib/notifications":{},"@/lib/operational-rules":{calculateHimbauanDueDate:()=>null},"@/lib/workspace-reads":{}
  });
  for(const edit of [{stage:"Closed"},{completionDate:"2026-11-05"},{caseCategory:"Pemeriksaan"}]) {
    const result=await route.PATCH(request({id:"case",version:"v1",case:{stage:"Working",caseCategory:"Himbauan",...edit}}));
    assert.equal(result.status,400);assert.match(result.body.error,/workflow/);
  }
  const saved=await route.PATCH(request({id:"case",version:"v1",case:{stage:"Working",caseCategory:"Himbauan",subject:"Updated reference"}}));
  assert.equal(saved.status,200);assert.equal(db.tables.tax_cases[0].case_workflow.result.number,"BA-001");
});
test("migration preserves records, locks snapshots to the server and captures completion atomically",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/20261105055510_case_workflow_and_task_timeline.sql",import.meta.url),"utf8");
  assert.match(sql,/add column if not exists case_workflow jsonb/);
  assert.match(sql,/after insert or update on public\.my_work_tasks/);
  assert.match(sql,/on delete restrict/g);assert.match(sql,/enable row level security/g);
  assert.match(sql,/revoke all on public\.tax_case_task_timeline from public, anon, authenticated/);
  assert.match(sql,/old\.is_completed and old\.case_id is not distinct from new\.case_id then return new/);
  assert.doesNotMatch(sql,/security definer|delete from|drop table/i);
});
