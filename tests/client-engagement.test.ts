import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {engagementType,validateEngagementChange} from '../lib/client-engagement.ts';
import {loadRoute} from './route-harness.ts';
const read=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const id='11111111-1111-4111-8111-111111111111';
test('engagement classification validates stable client IDs and keeps omitted legacy values contracted',()=>{
  assert.equal(engagementType(undefined),'contract');assert.equal(engagementType('on_demand'),'on_demand');
  assert.deepEqual(validateEngagementChange({engagementType:'on_demand',clients:[{id,beforeType:'contract'}]}),[{id,before_type:'contract'}]);
  for(const body of [{},{engagementType:'other',clients:[]},{engagementType:'on_demand',clients:[{id:'name',beforeType:'contract'}]},{engagementType:'on_demand',clients:[{id,beforeType:'contract'},{id,beforeType:'contract'}]}])assert.throws(()=>validateEngagementChange(body));
});
test('bulk engagement route rejects staff and validates before one atomic RPC with verified actor',async()=>{
  let role='staff',calls=0,conflict=false;
  const route=loadRoute('app/api/clients/engagement/route.ts',{'@/lib/access':{currentActor:async()=>({profile:{id:'verified',role},admin:{rpc:async(name:string,args:any)=>{calls++;assert.equal(name,'move_client_engagement_batch');assert.equal(args.actor_id,'verified');assert.equal(args.target_type,'on_demand');return conflict?{error:{code:'40001'}}:{data:1};}}}),isLeadership:(role:string)=>['leader','supervisor','partner'].includes(role)}});
  const req=(clients:any=[{id,beforeType:'contract'}])=>new Request('https://test.local/api/clients/engagement',{method:'POST',body:JSON.stringify({clients,engagementType:'on_demand',actorId:'forged'})});
  assert.equal((await route.POST(req())).status,403);assert.equal(calls,0);role='supervisor';assert.equal((await route.POST(req([]))).status,400);
  const result=await route.POST(req());assert.equal(result.status,200);assert.equal(result.body.updated,1);assert.equal(calls,1);
  conflict=true;assert.equal((await route.POST(req())).status,409);
});
function sheet(allowed=true){
  const dom=new JSDOM('<section id="client-management-view"></section>',{runScripts:'outside-only'}),w=dom.window as any;
  w.confirm=()=>true;const alerts:string[]=[];w.alert=(s:string)=>alerts.push(s);w.eval(read('public/client-engagement.js'));
  const rows=[{id:'one',databaseId:id,engagementType:'contract',taxPic:'Tax A',contractStartedAt:'2020-01-01'},{id:'two',databaseId:'22222222-2222-4222-8222-222222222222',engagementType:'contract'}];
  let visible=rows,tab='active',fail=false,release:any;const writes:any[]=[];
  const render=()=>{w.document.querySelector('#client-management-view').innerHTML='<div class="table-wrap"><table class="client-table"><thead><tr><th>No.</th></tr></thead><tbody>'+visible.map((r,i)=>`<tr data-client-master-toggle="${r.id}"><td>${i+1}</td></tr>`).join('')+'</tbody></table></div>';w.ClientEngagement.enhance({rows:visible,tab,canManage:allowed,offline:false,render,moved:(type:string)=>{tab=type==='on_demand'?'on-demand':'active';},fetch:async(_url:string,options:any)=>{writes.push(JSON.parse(options.body));await new Promise(resolve=>release=resolve);return {ok:!fail,json:async()=>fail?{error:'Conflict; refresh'}:{updated:visible.length}};}});};render();
  return {dom,w,rows,writes,alerts,render,filter:()=>{visible=[rows[0]];render();},fail:()=>{fail=true;},release:()=>release(),tab:()=>tab};
}
test('filtered bulk selection waits for confirmation and preserves PIC/contract dates when moved',async()=>{
  const d=sheet();try{
    d.filter();d.w.document.querySelector('[data-client-select-all]').click();d.w.document.querySelector('[data-move-client-engagement]').click();
    assert.equal(d.rows[0].engagementType,'contract');assert.equal(d.writes[0].clients.length,1);assert.equal(d.writes[0].clients[0].id,id);
    d.release();await new Promise(resolve=>setImmediate(resolve));assert.equal(d.rows[0].engagementType,'on_demand');assert.equal(d.rows[1].engagementType,'contract');assert.equal(d.rows[0].taxPic,'Tax A');assert.equal(d.rows[0].contractStartedAt,'2020-01-01');assert.equal(d.tab(),'on-demand');
  }finally{d.dom.window.close();}
});
test('failed moves retain confirmed classifications and staff cannot select/move rows',async()=>{
  const d=sheet();try{d.fail();d.w.document.querySelector('[data-client-select-all]').click();d.w.document.querySelector('[data-move-client-engagement]').click();d.release();await new Promise(resolve=>setImmediate(resolve));assert.equal(d.rows[0].engagementType,'contract');assert.match(d.alerts[0],/Conflict/);}finally{d.dom.window.close();}
  const staff=sheet(false);try{assert.equal(staff.w.document.querySelector('[data-client-select]'),null);assert.equal(staff.w.document.querySelector('[data-move-client-engagement]'),null);}finally{staff.dom.window.close();}
});
test('migration changes only engagement and audits atomically; monthly generation excludes non-contract clients',()=>{
  const sql=read('supabase/migrations/202611060002_client_engagement_type.sql'),ui=read('public/demo.html');
  assert.match(sql,/default 'contract'/);assert.match(sql,/for update/);assert.match(sql,/40001/);assert.match(sql,/client_engagement_changed/);assert.match(sql,/revoke all on function.*from public,anon,authenticated/);
  assert.doesNotMatch(sql,/delete from|update public\.(tax_cases|operational_workspace_state)|set.*pic/i);
  assert.match(read('app/api/operations/route.ts'),/\.eq\("engagement_type", "contract"\)/);
  assert.match(ui,/clients: \{ key: "contractStart", dir: "desc" \}/);assert.match(ui,/data-client-tab="on-demand"/);assert.match(ui,/allocation-engagement-filter/);
});
