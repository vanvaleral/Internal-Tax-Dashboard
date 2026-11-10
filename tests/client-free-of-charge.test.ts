import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {loadRoute,mockDatabase,request} from './route-harness.ts';
import * as security from '../lib/workspace-security.ts';
import * as monthlyValidation from '../lib/monthly-patch-validation.ts';
const ui=readFileSync(new URL('../public/demo.html',import.meta.url),'utf8');
function functionSource(name:string){const start=ui.indexOf(`    function ${name}(`);assert.ok(start>0);const end=ui.indexOf('\n    }',start);return ui.slice(start,end+6);}

test('paid portfolio and recurring workload are distinct, while FOC monthly snapshots use zero fees without altering master history',()=>{
  const row=(id:string,engagementType:string,clientStatus='Active',taxPic='PIC')=>({id,engagementType,clientStatus,taxPic,serviceFee:100,annualFee:360,obligations:{pph21:{status:'awaiting'}}});
  const clients=[row('paid','contract'),row('free','free_of_charge'),row('annual','on_demand'),row('inactive','free_of_charge','Inactive'),row('other','free_of_charge','Active','Other')];
  const api=vm.runInNewContext(`${functionSource('isActiveClientRecord')}\n${functionSource('activeClientMasterRecords')}\n${functionSource('recurringClientMasterRecords')}\n${functionSource('createMonthlyPeriodRows')}\n({paid:activeClientMasterRecords,recurring:recurringClientMasterRecords,generate:createMonthlyPeriodRows})`,{clientMasterClients:clients,state:{selectedPic:'PIC'},structuredClone});
  assert.deepEqual(Array.from(api.paid(),(c:any)=>c.id),['paid']);assert.deepEqual(Array.from(api.recurring(),(c:any)=>c.id),['paid','free','other']);
  const rows=api.generate('November',2026);assert.deepEqual(Array.from(rows,(c:any)=>c.id),['paid','free']);assert.equal(rows[1].serviceFee,0);assert.equal(rows[1].annualFee,0);assert.equal(clients[1].serviceFee,100);assert.equal(clients[1].annualFee,360);
  assert.match(ui,/data-client-tab="free-of-charge"/);assert.match(ui,/"free_of_charge","Free of Charge clients only"/);assert.match(ui,/"on_demand","free_of_charge"\].includes\(row.engagement_type\)/);
});

function generation(){
  const c=(id:string,type:string,status='Active',pic='tax')=>({id,client_code:`CL-${id}`,legal_name:id,status,engagement_type:type,tax_pic_profile_id:pic,tax_pic_name:'Tax PIC',monthly_fee:100,annual_fee:360,has_pph21:true});
  const db=mockDatabase({client_master:[c('1','contract'),c('2','free_of_charge'),c('3','on_demand'),c('4','free_of_charge','Inactive'),c('5','free_of_charge','Active','other')],staff_profiles:[{id:'tax',display_name:'Tax PIC',team_division:'Tax Team',directory_active:true}],operational_workspace_state:[]});
  const route=loadRoute('app/api/operations/route.ts',{'@/lib/access':{currentActor:async()=>({profile:{id:'supervisor',role:'supervisor',full_name:'Supervisor'},admin:db}),isLeadership:(role:string)=>role==='supervisor'},'@/lib/workspace-security':security,'@/lib/monthly-patch-validation':monthlyValidation});
  const call=(action:string)=>route.POST(request({action,period:'2026-11',targetProfileId:'tax'}));return {db,call};
}
test('server monthly generation includes assigned active FOC clients, excludes On Demand/inactive/other PIC and preserves stored fees',async()=>{
  const d=generation(),preview=await d.call('preview-monthly-period');assert.equal(preview.status,200);assert.equal(preview.body.assigned,2);assert.deepEqual(Array.from(preview.body.clients,(c:any)=>c.id),['1','2']);
  const result=await d.call('generate-monthly-period');assert.equal(result.status,200);assert.equal(result.body.created,2);
  const rows=d.db.tables.operational_workspace_state[0].payload['November 2026'];assert.equal(rows[1].engagementType,'free_of_charge');assert.equal(rows[1].serviceFee,0);assert.equal(rows[1].annualFee,0);assert.equal(rows[1].taxPicSnapshotProfileId,'tax');assert.equal(rows[1].obligations.pph21.status,'awaiting');
  assert.equal(d.db.tables.client_master[1].monthly_fee,100);assert.equal(d.db.tables.client_master[1].annual_fee,360);const repeat=await d.call('generate-monthly-period');assert.equal(repeat.body.created,0);assert.equal(d.db.tables.operational_workspace_state[0].payload['November 2026'].length,2);
});
test('reclassifying to FOC never rewrites a previously generated monthly row or its fee snapshot',async()=>{
  const d=generation(),historic={databaseId:'2',name:'Existing work',serviceFee:999,annualFee:123,obligations:{pph21:{status:'done',ntpn:'retained'}}};
  d.db.tables.operational_workspace_state.push({scope:'monthly_compliance',version:1,payload:{'November 2026':[historic]}});
  const result=await d.call('generate-monthly-period');assert.equal(result.body.created,1);assert.deepEqual(d.db.tables.operational_workspace_state[0].payload['November 2026'][0],historic);
});
