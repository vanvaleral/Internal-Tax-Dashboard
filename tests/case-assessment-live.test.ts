import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import * as domain from '../lib/case-workflow.ts';
import {latestCaseReportProgress} from '../lib/case-report-progress.ts';
import {loadRoute,mockDatabase,request} from './route-harness.ts';

const opts={category:'Pemeriksaan',actorId:'tax',actorName:'Tax PIC',taxAllowed:true,now:'2026-11-05T08:00:00Z',closed:false};
const cmd=(type:string,extra:any={})=>({type,requestId:randomUUID(),...extra});
const assessment=(extra:any={})=>({kind:'SKP',number:'SKP/001',date:'2026-11-01',tax:'PPN',period:'2025',principal:1000,penalty:200,paymentTarget:'2026-11-05',...extra});
const run=(w:domain.CaseWorkflow|null,c:any,extra:any={})=>domain.applyCaseWorkflowAction(w,c,{...opts,...extra});
const close=()=>run(null,cmd('close-examination',{number:'SPHP/001',date:'2026-10-30',assessments:[assessment()]}));

test('SPHP closure atomically links optional multiple assessments and rejects invalid or duplicate byproducts',()=>{
  assert.throws(()=>run(null,cmd('close-examination',{number:''})),/SPHP reference/);
  assert.throws(()=>run(null,cmd('record-assessment',assessment())),/Close the Pemeriksaan/);
  assert.throws(()=>run(null,cmd('close-examination',{number:'SPHP',assessments:[assessment(),assessment()]})),/already registered/);
  assert.throws(()=>run(null,cmd('close-examination',{number:'SPHP',date:'2026-11-06'})),/future/);
  const w=run(null,cmd('close-examination',{number:'SPHP',assessments:[assessment(),assessment({kind:'STP',number:'STP/001',principal:0})]}));
  assert.equal(w.examinationClosure!.number,'SPHP');assert.equal(w.final,null);assert.equal(w.products.length,2);assert.equal(w.schedule.length,2);assert.equal(w.events.length,1);
  assert.equal(domain.caseWorkflowStatus(w).payable,1400);assert.equal(w.products[0].assessment!.type,'SKP');
  const added=run(w,cmd('record-assessment',assessment({number:'SKP/002'})),{closed:true});assert.equal(added.products.length,3);assert.equal(w.products.length,2);
  assert.throws(()=>run(w,cmd('record-result')),{message:/SKP \/ STP register|already closed/});
});

test('post-SPHP payments stay active and assessment edits cannot rewrite receipts or instalment plans',()=>{
  const w=close(),p=w.products[0];
  const edited=run(w,cmd('edit-assessment',{...assessment({penalty:300}),productId:p.id}),{closed:true});
  assert.equal(edited.products[0].amount,1300);assert.equal(edited.schedule[0].amount,1300);
  const plan=run(edited,cmd('set-plan',{productId:p.id,count:3,date:'2027-01-31'}),{closed:true});
  assert.deepEqual(plan.schedule.map(s=>s.amount),[433,433,434]);assert.deepEqual(plan.schedule.map(s=>s.due),['2027-01-31','2027-02-28','2027-03-31']);
  assert.throws(()=>run(plan,cmd('edit-assessment',{...assessment(),productId:p.id}),{closed:true}),/instalment plan/);
  const paid=run(edited,cmd('record-payment',{scheduleId:edited.schedule[0].id,amount:1300,proof:'NTPN',date:'2026-11-02',verified:true}),{closed:true});
  assert.equal(domain.caseWorkflowStatus(paid).settled,true);assert.equal(paid.final,null);
  assert.throws(()=>run(paid,cmd('edit-assessment',{...assessment({number:'changed',penalty:300}),productId:p.id}),{closed:true}),/Receipts exist/);
  assert.throws(()=>run(paid,cmd('set-plan',{productId:p.id,count:2,date:'2027-01-31'}),{closed:true}),/Receipts already exist/);
});

test('legacy SKP classification preserves product IDs, balances, schedules and receipts without duplicating liability',()=>{
  const legacy=run(null,cmd('record-result',{number:'OLD-SKP',date:'2026-11-01',text:'Existing result',outcome:'Additional tax / revision',products:[{tax:'PPN',period:'2025',amount:1200}],paymentTarget:'2026-11-05'}),{category:'Himbauan'});
  legacy.result!.kind='SKP';
  const paid=run(legacy,cmd('record-payment',{scheduleId:legacy.schedule[0].id,amount:1200,date:'2026-11-02',proof:'OLD-NTPN',verified:true}));
  const closed=run(paid,cmd('close-examination',{number:'SPHP/LEGACY',date:'2026-10-30'}));
  assert.throws(()=>run(closed,cmd('record-assessment',assessment()),{closed:true}),/Classify the existing legacy liabilities/);
  assert.throws(()=>run(closed,cmd('record-assessment',{...assessment({principal:500}),productId:closed.products[0].id}),{closed:true}),/preserve its recorded total/);
  const classified=run(closed,cmd('record-assessment',{...assessment(),productId:closed.products[0].id}),{closed:true});
  assert.equal(classified.products.length,1);assert.equal(classified.products[0].id,legacy.products[0].id);assert.deepEqual(classified.payments,paid.payments);assert.deepEqual(classified.schedule,paid.schedule);
  assert.equal(domain.caseWorkflowStatus(classified).payable,1200);assert.equal(domain.caseWorkflowStatus(classified).paid,1200);
});

test('PSA routing, submissions and decisions preserve one liability and protect submitted history',()=>{
  const w=close(),id=w.products[0].id,route=cmd('psa-route',{productIds:[id]});
  assert.throws(()=>run(w,route,{taxAllowed:false,closed:true}),/assigned Tax PIC/);
  assert.throws(()=>run(w,cmd('psa-route',{productIds:[id,'other-case']}),{closed:true}),/does not belong/);assert.equal(w.products[0].assessment!.psa,null);
  const routed=run(w,route,{closed:true});assert.equal(run(routed,route,{closed:true}),routed);
  assert.throws(()=>run(routed,cmd('psa-route',{productIds:[id]}),{closed:true}),/unrouted/);
  const edit={productId:id,requested:200,application:'PSA/001',date:'2026-11-02',status:'Diajukan',note:'Supporting explanation'};
  assert.throws(()=>run(routed,cmd('psa-edit',{...edit,requested:201}),{closed:true}),/assessed penalty/);
  const submitted=run(routed,cmd('psa-edit',edit),{closed:true});
  assert.throws(()=>run(submitted,cmd('psa-return',{productIds:[id]}),{closed:true}),/Only draft/);
  assert.throws(()=>run(submitted,cmd('psa-edit',{...edit,application:'replaced'}),{closed:true}),/protected/);
  assert.throws(()=>run(submitted,cmd('psa-edit',{...edit,status:'Draft'}),{closed:true}),/forward/);
  assert.throws(()=>run(submitted,cmd('psa-decision',{productId:id,outcome:'Ditolak',amount:1,number:'KEP',date:'2026-11-04'}),{closed:true}),/match the decision/);
  const decided=run(submitted,cmd('psa-decision',{productId:id,outcome:'Disetujui sebagian',amount:100,number:'KEP/001',date:'2026-11-04'}),{closed:true});
  assert.equal(decided.products[0].assessment!.psa!.decision!.amount,100);assert.equal(decided.products[0].assessment!.psa!.status,'Disetujui sebagian');assert.equal(domain.caseWorkflowStatus(decided).payable,1200);
  assert.throws(()=>run(decided,cmd('psa-decision',{productId:id}),{closed:true}),/existing decision/);
});

test('manual follow-up removal is author/leadership-only, recoverable, audited and excluded from reports',()=>{
  const entry={id:randomUUID(),entry:'Mistaken update',created_by_profile_id:'acc'},command=cmd('remove-progress',{entryId:entry.id,reason:'Wrong client'});
  assert.throws(()=>run(null,command,{progressEntry:entry}),/Only the author/);
  assert.throws(()=>run(null,command,{progressEntry:{...entry,id:'different'},leadership:true}),/existing manual/);
  const removed=run(null,command,{progressEntry:entry,leadership:true,closed:true});assert.equal(removed.removedProgress![0].entry,entry.entry);assert.equal(removed.events.length,1);
  const rows=[{id:'case',case_workflow:removed}],followups=[{...entry,case_id:'case',created_at:'2026-11-06T00:00:00Z'}];
  assert.doesNotMatch(JSON.stringify(latestCaseReportProgress(rows,[],followups,[])),/Mistaken update/);
  const restored=run(removed,cmd('restore-progress',{entryId:entry.id}),{progressEntry:entry,actorId:'acc',closed:true});
  assert.ok(restored.removedProgress![0].restoredAt);assert.equal(restored.events.length,2);assert.equal(restored.removedProgress![0].reason,'Wrong client');
});

test('workflow endpoint closes at SPHP but keeps post-close saves version-checked and denies foreign follow-ups',async()=>{
  const row:any={id:'case',case_category:'Pemeriksaan',stage:'Working',updated_at:'v1',tax_pic_profile_id:'tax',accounting_pic_profile_id:'acc',case_workflow:null};
  const entry={id:randomUUID(),case_id:'different-case',entry:'Other case',created_by_profile_id:'tax'};
  const db=mockDatabase({tax_cases:[row],tax_case_progress_entries:[entry]});
  const route=loadRoute('app/api/cases/workflow/route.ts',{'@/lib/access':{currentActor:async()=>({profile:{id:'tax',role:'staff',full_name:'Synthetic PIC'},admin:db}),isLeadership:()=>false},'@/lib/case-workflow':domain});
  const save=(command:any,version='v1')=>route.PATCH(request({id:'case',version,command}));
  const result=await save(cmd('close-examination',{number:'SPHP/ROUTE',date:'2026-10-30'}));assert.equal(result.status,200);assert.equal(row.stage,'Closed');assert.equal(row.completion_date,'2026-10-30');assert.equal(row.case_workflow.final,null);
  assert.equal((await save(cmd('record-assessment',assessment()),'stale')).status,409);
  assert.equal((await save(cmd('record-assessment',assessment()))).status,200);
  assert.equal((await save(cmd('remove-progress',{entryId:entry.id,reason:'Wrong'}))).status,404);
  const before=structuredClone(row.case_workflow);db.beforeWrite=()=>{row.updated_at='concurrent';};
  assert.equal((await save(cmd('psa-route',{productIds:[row.case_workflow.products[0].id]}))).status,409);assert.deepEqual(row.case_workflow,before);
});
