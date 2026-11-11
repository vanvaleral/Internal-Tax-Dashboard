import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {engagementType,validateEngagementChange,MONTHLY_ENGAGEMENT_TYPES} from '../lib/client-engagement.ts';
import {loadRoute} from './route-harness.ts';
const read=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const id='11111111-1111-4111-8111-111111111111';
test('engagement classification validates stable client IDs and keeps omitted legacy values contracted',()=>{
  assert.equal(engagementType(undefined),'contract');assert.equal(engagementType('on_demand'),'on_demand');
  assert.equal(engagementType('free_of_charge'),'free_of_charge');assert.deepEqual([...MONTHLY_ENGAGEMENT_TYPES],['contract','free_of_charge']);
  assert.deepEqual(validateEngagementChange({engagementType:'free_of_charge',clients:[{id,beforeType:'on_demand'}]}),[{id,before_type:'on_demand'}]);
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
function sheet(allowed=true,initialTab='active'){
  const dom=new JSDOM('<section id="client-management-view"></section>',{runScripts:'outside-only'}),w=dom.window as any;
  w.confirm=()=>true;const alerts:string[]=[];w.alert=(s:string)=>alerts.push(s);w.eval(read('public/client-engagement.js'));
  const rows=[{id:'one',databaseId:id,engagementType:'contract',taxPic:'Tax A',contractStartedAt:'2020-01-01'},{id:'two',databaseId:'22222222-2222-4222-8222-222222222222',engagementType:'contract'}];
  rows.forEach(row=>{row.engagementType=initialTab==='on-demand'?'on_demand':initialTab==='free-of-charge'?'free_of_charge':'contract';});
  let visible=rows,tab=initialTab,fail=false,release:any,renders=0;const writes:any[]=[];
  const render=()=>{renders++;w.document.querySelector('#client-management-view').innerHTML='<input data-client-search value="Retain search" /><div class="table-wrap"><table class="client-table"><thead><tr><th>No.</th></tr></thead><tbody>'+visible.map((r,i)=>`<tr data-client-master-toggle="${r.id}"><td>${i+1}</td></tr>`).join('')+'</tbody></table><div data-expanded-client>Retain expanded details</div></div>'+visible.map(r=>`<div class="client-mobile-row" data-client-master-toggle="${r.id}"><div class="client-mobile-name"></div></div>`).join('');w.ClientEngagement.enhance({rows:visible,tab,canManage:allowed,offline:false,render,moved:(type:string)=>{tab=type==='on_demand'?'on-demand':type==='free_of_charge'?'free-of-charge':'active';},fetch:async(_url:string,options:any)=>{writes.push(JSON.parse(options.body));await new Promise(resolve=>release=resolve);return {ok:!fail,json:async()=>fail?{error:'Conflict; refresh'}:{updated:visible.length}};}});};render();
  return {dom,w,rows,writes,alerts,render,renders:()=>renders,filter:()=>{visible=[rows[0]];render();},fail:()=>{fail=true;},release:()=>release(),tab:()=>tab};
}

test('client selection preserves table identity, scroll, focus and expanded details in every engagement tab',()=>{
  for(const tab of ['active','free-of-charge','on-demand']){
    const d=sheet(true,tab);try{
      const doc=d.w.document,wrap=doc.querySelector('.table-wrap'),table=doc.querySelector('.client-table'),details=doc.querySelector('[data-expanded-client]'),search=doc.querySelector('[data-client-search]');
      const first=table.querySelector('[data-client-select="one"]'),secondMobile=doc.querySelector('.client-mobile-row [data-client-select="two"]');
      wrap.scrollTop=640;wrap.scrollLeft=120;search.value='Keep this search';first.focus();first.click();
      assert.equal(d.renders(),1);assert.equal(doc.activeElement,first);assert.equal(doc.querySelector('.client-table'),table);
      assert.equal(doc.querySelector('.table-wrap'),wrap);assert.equal(wrap.scrollTop,640);assert.equal(wrap.scrollLeft,120);
      assert.equal(doc.querySelector('[data-expanded-client]'),details);assert.equal(search.value,'Keep this search');
      assert.equal(doc.querySelector('.client-mobile-row [data-client-select="one"]').checked,true);
      assert.equal(doc.querySelector('[data-client-selection-count]').textContent,'1 selected');
      for(const input of doc.querySelectorAll('[data-client-select-all]')){assert.equal(input.checked,false);assert.equal(input.indeterminate,true);}
      secondMobile.click();assert.equal(table.querySelector('[data-client-select="two"]').checked,true);
      for(const input of doc.querySelectorAll('[data-client-select-all]')){assert.equal(input.checked,true);assert.equal(input.indeterminate,false);}
      const all=table.querySelector('[data-client-select-all]');all.focus();all.click();
      assert.equal(doc.activeElement,all);assert.equal(doc.querySelector('[data-client-selection-count]').textContent,'0 selected');
      assert.equal(doc.querySelector('[data-move-client-engagement]').disabled,true);
      for(const input of doc.querySelectorAll('[data-client-select],[data-client-select-all]'))assert.equal(input.checked,false);
      doc.querySelector('.client-engagement-actions [data-client-select-all]').click();
      assert.equal(doc.querySelector('[data-client-selection-count]').textContent,'2 selected');
      assert.equal(doc.querySelector('[data-move-client-engagement]').disabled,false);
      assert.equal(d.renders(),1);assert.equal(d.writes.length,0);assert.equal(wrap.scrollTop,640);assert.equal(wrap.scrollLeft,120);
    }finally{d.dom.window.close();}
  }
});

test('selection is pruned to filtered clients after a real render and both select-all controls stay synchronized',()=>{
  const d=sheet();try{
    d.w.document.querySelector('[data-client-select-all]').click();d.filter();
    const doc=d.w.document;
    assert.equal(doc.querySelector('[data-client-selection-count]').textContent,'1 selected');
    assert.equal(doc.querySelector('[data-client-select="one"]').checked,true);
    for(const input of doc.querySelectorAll('[data-client-select-all]')){assert.equal(input.checked,true);assert.equal(input.indeterminate,false);}
    const renders=d.renders();doc.querySelector('[data-client-select="one"]').click();
    assert.equal(d.renders(),renders);assert.equal(doc.querySelector('[data-client-selection-count]').textContent,'0 selected');
    for(const input of doc.querySelectorAll('[data-client-select-all]')){assert.equal(input.checked,false);assert.equal(input.indeterminate,false);}
  }finally{d.dom.window.close();}
});
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
test('migration changes only engagement and audits atomically; monthly generation includes FOC but not On Demand',()=>{
  const sql=read('supabase/migrations/202611060002_client_engagement_type.sql'),ui=read('public/demo.html');
  assert.match(sql,/default 'contract'/);assert.match(sql,/for update/);assert.match(sql,/40001/);assert.match(sql,/client_engagement_changed/);assert.match(sql,/revoke all on function.*from public,anon,authenticated/);
  assert.doesNotMatch(sql,/delete from|update public\.(tax_cases|operational_workspace_state)|set.*pic/i);
  assert.match(read('app/api/operations/route.ts'),/\.in\("engagement_type", \[\.\.\.MONTHLY_ENGAGEMENT_TYPES\]\)/);
  assert.match(ui,/clients: \{ key: "contractStart", dir: "desc" \}/);assert.match(ui,/data-client-tab="on-demand"/);assert.match(ui,/allocation-engagement-filter/);
});

test('leadership can move selected clients to Free of Charge and back without changing historical details',async()=>{
  const d=sheet();try{
    d.filter();d.w.document.querySelector('[data-client-select-all]').click();const select=d.w.document.querySelector('[data-client-engagement-target]');select.value='free_of_charge';select.dispatchEvent(new d.w.Event('change',{bubbles:true}));
    d.w.document.querySelector('[data-move-client-engagement]').click();assert.equal(d.writes[0].engagementType,'free_of_charge');assert.equal(d.rows[0].engagementType,'contract');d.release();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(d.rows[0].engagementType,'free_of_charge');assert.equal(d.tab(),'free-of-charge');assert.equal(d.rows[0].taxPic,'Tax A');assert.equal(d.rows[0].contractStartedAt,'2020-01-01');
    d.w.document.querySelector('[data-client-select-all]').click();d.w.document.querySelector('[data-move-client-engagement]').click();assert.equal(d.writes[1].engagementType,'contract');assert.equal(d.writes[1].clients[0].beforeType,'free_of_charge');d.release();await new Promise(resolve=>setImmediate(resolve));assert.equal(d.rows[0].engagementType,'contract');
  }finally{d.dom.window.close();}
});

test('Free of Charge schema extension preserves fees/history and keeps bulk updates server-only',()=>{
  const sql=read('supabase/migrations/20261110072359_free_of_charge_clients.sql');
  assert.match(sql,/check \(engagement_type in \('contract','on_demand','free_of_charge'\)\)/);assert.match(sql,/security invoker set search_path = ''/);assert.match(sql,/for update/);assert.match(sql,/client_engagement_changed/);
  assert.doesNotMatch(sql,/delete from|drop table|set (monthly_fee|annual_fee|status|tax_pic)|security definer/i);
  assert.match(sql,/from public,anon,authenticated/);assert.match(sql,/to service_role/);
});
