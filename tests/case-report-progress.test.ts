import assert from "node:assert/strict";
import test from "node:test";
import * as progress from "../lib/case-report-progress.ts";
import {loadRoute,mockDatabase,request} from "./route-harness.ts";
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const taxCase={id,tax_pic_profile_id:'tax',accounting_pic_profile_id:'acc',updated_at:'2026-11-05T07:00:00Z',updater:{display_name:'Tax PIC'},case_workflow:{events:[{text:'BA registered',actor:'ACC PIC',at:'2026-11-03T00:00:00Z'}]}};
test("latest report entry merges sources by actual date, retaining snapshot titles instead of mutable task titles",()=>{
  const result=progress.latestCaseReportProgress([taxCase],[{id:'event',case_id:id,task_id:'task',title:'Original completed task',actor_name:'ACC PIC',occurred_at:'2026-11-04T00:00:00Z',event_type:'completed'}],[{case_id:id,entry:'Older manual update',created_at:'2026-11-02T00:00:00Z',staff_profiles:{display_name:'ACC PIC'}}],[{case_id:id,id:'task',title:'Renamed current task',completed_at:'2026-11-05T00:00:00Z'}]);
  assert.equal(result[id]!.entry,'Completed: Original completed task');assert.equal(result[id]!.creatorName,'ACC PIC');
  const updates=progress.lastCaseReportUpdates([taxCase],result);
  assert.equal(updates[id].createdAt,taxCase.updated_at);assert.equal(updates[id].creatorName,'Tax PIC');assert.equal(updates[id].source,'Case record');
});
test("newer manual or linked work determines last PIC activity even when case fields were not edited",()=>{
  const result=progress.latestCaseReportProgress([taxCase],[],[{case_id:id,entry:'Fresh manual follow-up',created_at:'2026-11-05T08:00:00Z',staff_profiles:[{display_name:'ACC PIC'}]}],[]);
  assert.equal(result[id]!.source,'Follow-up');assert.equal(progress.lastCaseReportUpdates([taxCase],result)[id].creatorName,'ACC PIC');
  const legacy=progress.latestCaseReportProgress([{id}],[],[],[{id:'task',case_id:id,title:'Completed linked task',completed_at:'2026-11-01',completer:null}]);
  assert.equal(legacy[id]!.creatorName,'Unknown completer');assert.equal(progress.latestCaseReportProgress([{id}],[],[],[])[id],null);
});
function fixture(actorId='tax',role='staff'){
  const db=mockDatabase({tax_cases:[structuredClone(taxCase),{...structuredClone(taxCase),id:other,tax_pic_profile_id:'other',accounting_pic_profile_id:null}],tax_case_task_timeline:[],tax_case_progress_entries:[],my_work_tasks:[]});
  const calls:string[]=[],from=db.from.bind(db);db.from=(table:string)=>{calls.push(table);return from(table);};
  const route=loadRoute('app/api/cases/report/route.ts',{'@/lib/access':{currentActor:async()=>({profile:{id:actorId,role},admin:db}),isLeadership:(value:string)=>['leader','supervisor','partner','admin'].includes(value)},'@/lib/case-report-progress':progress});
  return {db,calls,route,post:(ids:any[])=>route.POST(request({caseIds:ids}))};
}
test("report endpoint checks every case before reading progress and rejects archived or invalid IDs",async()=>{
  const d=fixture();assert.equal((await d.post([id,other])).status,403);assert.deepEqual(d.calls,['tax_cases']);
  assert.equal((await d.post(['invalid'])).status,400);
  d.db.tables.tax_cases[0].deleted_at='2026-11-05';assert.equal((await d.post([id])).status,403);
  assert.equal((await d.post(Array.from({length:101},()=>id))).status,400);
});
test("report endpoint returns latest-only progress and current versions without changing source records",async()=>{
  const d=fixture('supervisor','supervisor');
  d.db.tables.tax_case_progress_entries.push({id:'note',case_id:id,entry:'Latest report note',created_at:'2026-11-05T08:00:00Z',staff_profiles:{display_name:'ACC PIC'}});
  const before=JSON.stringify(d.db.tables),response=await d.post([id,other]);
  assert.equal(response.status,200);assert.equal(response.body.latestById[id].entry,'Latest report note');
  assert.equal(response.body.lastUpdateById[id].creatorName,'ACC PIC');assert.equal(response.body.versionsById[id],taxCase.updated_at);
  assert.equal(response.headers['Cache-Control'],'no-store');assert.equal(JSON.stringify(d.db.tables),before);
});
test("report history pagination reads beyond 1000 rows rather than silently truncating",async()=>{
  const rows=Array.from({length:1001},(_,i)=>({id:String(i),case_id:id,entry:`Update ${i}`,created_at:i===1000?'2026-11-05T08:00:00Z':'2026-11-01T00:00:00Z'}));
  const db=mockDatabase({tax_case_progress_entries:rows});
  const read=await progress.readReportHistory(db,'tax_case_progress_entries','*',[id],'created_at');
  assert.equal(read.length,1001);assert.equal(progress.latestCaseReportProgress([{id}],[],read,[])[id]!.entry,'Update 1000');
});
test("a history read failure blocks the whole report instead of returning a partial latest entry",async()=>{
  const d=fixture(),from=d.db.from.bind(d.db);
  d.db.from=(table:string)=>{const q=from(table);if(table==='tax_case_progress_entries')q.then=(resolve:any)=>Promise.resolve({data:null,error:{message:'Synthetic read error'}}).then(resolve);return q;};
  const response=await d.post([id]);assert.equal(response.status,500);assert.match(response.body.error,/Synthetic read error|Latest case progress could not be loaded/);assert.equal(response.body.latestById,undefined);
});
test("case updates made during history reads require a fresh report instead of mixed versions",async()=>{
  const d=fixture(),from=d.db.from.bind(d.db);let caseReads=0;
  d.db.from=(table:string)=>{if(table==='tax_cases'&&++caseReads===2)d.db.tables.tax_cases[0].updated_at='2026-11-05T09:00:00Z';return from(table);};
  const response=await d.post([id]);assert.equal(response.status,409);assert.equal(response.body.code,'VERSION_CONFLICT');assert.equal(response.body.latestById,undefined);
});
