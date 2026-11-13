import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import * as bulk from "../lib/client-bulk-edit.ts";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";

const read=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const tick=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row=(n:number,extra={}):Record<string,any>=>({id:id(n),client_code:`CL-${n}`,legal_name:`Client ${n}`,company_form:'PT',status:'Active',engagement_type:'contract',updated_at:'2026-11-13T01:00:00Z',monthly_fee:1000000,annual_fee:3600000,contract_started_at:'2025-01-01',has_pph21:false,tax_pic_name:n===2?'Tax B':'Tax A',accounting_pic_name:n===3?'ACC B':'ACC A',...extra});
function api(role='supervisor'){
  const rows=[row(1),row(2,{engagement_type:'on_demand'}),row(3,{status:'Inactive',engagement_type:'free_of_charge'})];
  const db=mockDatabase({client_master:rows}),calls:any[]=[];
  let conflict=false,identityError=false;
  db.rpc=async(name,args)=>{
    calls.push({name,args:structuredClone(args)});
    const matches=args.p_rows.map((patch:any,index:number)=>{const target=rows.find(row=>row.client_code===patch.client_code)!;return {row:index+2,clientId:target.id,clientCode:target.client_code,updatedAt:target.updated_at,action:'update',matchedBy:'code',errors:identityError?['Name belongs to another client']:[]};});
    if(name==='match_client_master_import')return {data:{matches},error:null};
    if(conflict||JSON.stringify(matches)!==JSON.stringify(args.p_expected_matches))return {data:null,error:{code:'40001',message:'Changed'}};
    args.p_rows.forEach((patch:any)=>Object.assign(rows.find(row=>row.client_code===patch.client_code)!,patch,{updated_at:'v2'}));
    return {data:{updated:args.p_rows.length,created:0,data:[]},error:null};
  };
  const route=loadRoute('app/api/clients/bulk-edit/route.ts',{
    '@/lib/access':{currentActor:async()=>({admin:db,userId:'user',profile:{id:'leader',role}}),isLeadership:(r:string)=>['leader','supervisor','partner','admin'].includes(r)},
    '@/lib/client-bulk-edit':bulk
  });
  return {route,rows,calls,db,conflict:()=>{conflict=true;},identityError:()=>{identityError=true;}};
}
const change=(row:any,changes:any)=>({id:row.id,expectedUpdatedAt:row.updated_at,changes});

test('bulk fields normalize day-first dates and rupiah, reject protected identities/PICs and preserve explicit blanks',()=>{
  const result=bulk.parseClientBulkChanges([change(row(1),{contract_started_at:'13/11/2026',monthly_fee:'2.500.000',annual_fee:'',npwp:'12.345.678.9-012.345',notes:'',has_ppn:false})]);
  assert.deepEqual(result[0].changes,{contract_started_at:'2026-11-13',monthly_fee:2500000,annual_fee:0,npwp:'123456789012345',notes:null,has_ppn:false});
  for(const changes of [{id:id(2)},{client_code:'OTHER'},{tax_pic_profile_id:id(2)},{accounting_pic_name:'New PIC'},{status:'Active'},{engagement_type:'contract'},{monthly_fee:'-1'},{annual_fee:'1,500'},{has_ppn:'true'},{contract_started_at:'31/02/2026'},{legal_name:''},{legal_name:{value:'Wrong'}},{npwp:123456789012345},{npwp:'123'}])assert.throws(()=>bulk.parseClientBulkChanges([change(row(1),changes)]));
  assert.throws(()=>bulk.parseClientBulkChanges([change(row(1),{notes:'a'}),change(row(1),{notes:'b'})]));
});

test('only active leadership can read/edit, and review never commits changes',async()=>{
  const denied=api('staff');assert.equal((await denied.route.GET(request())).status,403);assert.equal((await denied.route.POST(request({operation:'save'}))).status,403);assert.equal(denied.calls.length,0);
  for(const role of ['leader','supervisor','partner']){
    const d=api(role),initial=structuredClone(d.rows);
    const get=await d.route.GET(request());assert.equal(get.body.data.length,3);assert.ok(get.body.fields.length);
    const result=await d.route.POST(request({operation:'review',clients:[change(d.rows[0],{monthly_fee:'2.500.000'})]}));
    assert.equal(result.status,200);assert.equal(result.body.review[0].fields[0].before,1000000);assert.equal(result.body.review[0].fields[0].after,2500000);
    assert.equal(d.calls.filter(call=>call.name.startsWith('commit')).length,0);assert.deepEqual(d.rows,initial);
  }
});

test('PIC filters receive current directory labels rather than separate legacy capitalizations',async()=>{
  const d=api();d.db.tables.staff_profiles=[{id:id(20),display_name:'Harry',full_name:'Harry Staff'}];
  d.rows[0].tax_pic_profile_id=id(20);d.rows[0].tax_pic_name='HARRY';d.rows[1].tax_pic_name='Harry Staff';
  const result=await d.route.GET(request());assert.equal(result.body.data[0].tax_pic_name,'Harry');assert.equal(result.body.data[1].tax_pic_name,'Harry');
  assert.equal(d.rows[0].tax_pic_name,'HARRY','display canonicalization does not rewrite master records');
});

test('saving requires review and uses one guarded audited transaction with partial fields only',async()=>{
  const d=api(),clients=[change(d.rows[0],{monthly_fee:2500000}),change(d.rows[2],{notes:'Archive correction'})];
  assert.equal((await d.route.POST(request({operation:'save',clients}))).status,422);
  const preview=await d.route.POST(request({operation:'review',clients}));
  const saved=await d.route.POST(request({operation:'save',clients,expectedMatches:preview.body.expectedMatches}));
  assert.equal(saved.status,200);assert.equal(saved.body.updated,2);
  const commit=d.calls.find(call=>call.name==='commit_matched_client_import');assert.ok(commit);
  assert.match(commit.args.p_file_name,/Bulk Edit.*no uploaded file/);
  assert.equal(Object.hasOwn(commit.args.p_rows[0],'status'),false);assert.equal(Object.hasOwn(commit.args.p_rows[0],'tax_pic_name'),false);
  assert.equal(d.rows[0].monthly_fee,2500000);assert.equal(d.rows[0].annual_fee,3600000);assert.equal(d.rows[2].status,'Inactive');assert.equal(d.rows[2].engagement_type,'free_of_charge');
});

test('stale, missing, conflicting and modified-after-review records cannot partially save',async()=>{
  const d=api(),clients=[change(d.rows[0],{monthly_fee:2500000}),change(d.rows[1],{notes:'Edit'})];
  d.rows[0].updated_at='changed';assert.equal((await d.route.POST(request({operation:'review',clients}))).status,409);assert.equal(d.calls.length,0);
  const missing=api();assert.equal((await missing.route.POST(request({operation:'review',clients:[{id:id(99),expectedUpdatedAt:'old',changes:{notes:'X'}}]}))).status,409);
  const identity=api();identity.identityError();assert.equal((await identity.route.POST(request({operation:'review',clients:[change(identity.rows[0],{legal_name:'Another client'})]}))).status,422);
  const race=api(),patch=[change(race.rows[0],{notes:'Draft'})];
  const preview=await race.route.POST(request({operation:'review',clients:patch}));race.conflict();
  assert.equal((await race.route.POST(request({operation:'save',clients:patch,expectedMatches:preview.body.expectedMatches}))).status,409);assert.equal(race.rows[0].notes,undefined);
  const changed=api(),original=[change(changed.rows[0],{notes:'A'})],expected=await changed.route.POST(request({operation:'review',clients:original}));changed.rows[0].updated_at='new';
  assert.equal((await changed.route.POST(request({operation:'save',clients:original,expectedMatches:expected.body.expectedMatches}))).status,409);
});

async function ui(){
  const d=api(),warnings:string[]=[],vc=new VirtualConsole();vc.on('jsdomError',e=>warnings.push(e.message));
  const dom=new JSDOM('<div id="bulk"></div>',{url:'https://test.invalid',runScripts:'outside-only',virtualConsole:vc}),w=dom.window as any;
  w.confirm=()=>true;w.structuredClone=structuredClone;
  const requests:any[]=[];
  const fetch=async(_url:string,init:any={})=>{
    requests.push(init.method?JSON.parse(init.body):{operation:'get'});
    const result=init.method?await d.route.POST(request(JSON.parse(init.body))):await d.route.GET(request());
    return {ok:result.status===200,status:result.status,json:async()=>structuredClone(result.body)};
  };
  w.eval(read('public/client-bulk-edit.js'));
  const options={account:'account-a',canEdit:true,offline:false,fetch,onSaved:()=>{}};
  w.ClientBulkEdit.mount(w.document.getElementById('bulk'),options);await tick();
  const q=(selector:string)=>w.document.querySelector(selector);
  const edit=(selector:string,value:string)=>{const el=q(selector);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));};
  return {...d,dom,w,warnings,requests,options,q,edit};
}

test('cells stage edits without replacing editors or scrolling, then review/save explicitly',async()=>{
  const d=await ui();try{
    const selector=`[data-cb-id="${id(1)}"][data-cb-cell="legal_name"]`,input=d.q(selector),viewport=d.q('.cb-table-wrap');viewport.scrollLeft=135;
    d.edit(selector,'Client renamed');assert.equal(d.q(selector),input);assert.equal(viewport.scrollLeft,135);
    assert.equal(d.requests.filter(r=>r.operation!=='get').length,0);assert.match(d.q('[data-cb-count]').textContent,/1 client/);
    d.q('[data-cb-review]').click();await tick();assert.ok(d.q('[aria-label="Review client bulk changes"]'));assert.equal(d.rows[0].legal_name,'Client 1');
    assert.equal(d.q('[aria-label="Review client bulk changes"]').closest('.cb-panel'),null,'review stays outside the clipped/filtered sheet panel');
    assert.equal(d.q('.cb-underlay').hasAttribute('inert'),true,'the review cannot drift while editing underlying cells');
    d.q('[data-cb-save]').click();await tick();await tick();assert.equal(d.rows[0].legal_name,'Client renamed');assert.equal(d.q('[aria-label="Review client bulk changes"]'),null);
    assert.match(d.q('[data-cb-count]').textContent,/0 client/);assert.match(d.q('[data-cb-count]').textContent,/Saved 1 client/);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test('selected updates span groups, filters combine and reset does not silently discard drafts',async()=>{
  const d=await ui();try{
    d.q('[data-cb-select-page]').checked=true;d.q('[data-cb-select-page]').dispatchEvent(new d.w.Event('change',{bubbles:true}));
    d.q('[data-cb-group="commercial"]').click();d.q('[data-cb-value]').value='2.000.000';d.q('[data-cb-apply]').click();
    assert.match(d.q('[data-cb-count]').textContent,/2 client/);assert.equal(d.requests.filter(r=>r.operation!=='get').length,0);
    d.q('[data-cb-group="obligations"]').click();d.q('[data-cb-apply]').click();
    d.q('[data-cb-review]').click();await tick();
    const review=d.requests.find(r=>r.operation==='review');assert.equal(review.clients.length,2);assert.equal(review.clients[0].changes.monthly_fee,'2.000.000');assert.equal(review.clients[0].changes.has_pph21,true);
    d.q('[data-cb-cancel-review]').click();d.edit('[data-cb-filter="tax"]','Tax A');d.edit('[data-cb-filter="acc"]','ACC A');
    assert.equal(d.w.document.querySelectorAll('[data-cb-select]').length,1);assert.match(d.q('[data-cb-count]').textContent,/2 client/);
    d.q('[data-cb-clear-filters]').click();assert.match(d.q('[data-cb-count]').textContent,/2 client/);
    d.q('[data-cb-reset]').click();await tick();assert.match(d.q('[data-cb-count]').textContent,/0 client/);
    assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test('failed save retains drafts, and another account cannot inherit drafts or late reads',async()=>{
  const d=await ui();try{
    d.edit(`[data-cb-id="${id(1)}"][data-cb-cell="legal_name"]`,'Pending name');d.q('[data-cb-review]').click();await tick();d.conflict();d.q('[data-cb-save]').click();await tick();
    assert.match(d.q('[role="alert"]').textContent,/changed/i);d.q('[data-cb-cancel-review]').click();assert.match(d.q('[data-cb-count]').textContent,/1 client/);
    d.w.ClientBulkEdit.mount(d.q('#bulk'),{...d.options,account:'account-b'});await tick();assert.match(d.q('[data-cb-count]').textContent,/0 client/);
    let release:(value:any)=>void=()=>{};
    d.w.ClientBulkEdit.mount(d.q('#bulk'),{...d.options,account:'delayed',fetch:()=>new Promise(resolve=>{release=resolve;})});
    d.w.ClientBulkEdit.mount(d.q('#bulk'),{...d.options,account:'current'});await tick();
    release({ok:true,json:async()=>({data:[row(99,{legal_name:'Other account secret'})],fields:bulk.CLIENT_BULK_FIELDS})});await tick();
    assert.doesNotMatch(d.q('#bulk').textContent,/Other account secret/);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test('the live Clients shell exposes the tab only for leadership and keeps bulk assets data-free',()=>{
  const html=read('public/demo.html');assert.match(html,/hasLeadershipAccess\(\) \? `<button[^\n]+data-client-tab="bulk-edit"/);
  assert.match(html,/clientManagementTab === "bulk-edit" && \(!hasLeadershipAccess/);
  assert.match(html,/ClientBulkEdit\?\.mount/);assert.match(html,/client-bulk-edit\.css/);
  assert.doesNotMatch(read('public/client-bulk-edit.js'),/localStorage|sessionStorage/);
});
