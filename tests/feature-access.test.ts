import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {JSDOM} from "jsdom";
import * as access from "../lib/feature-access.ts";
import {loadRoute,mockDatabase} from "./route-harness.ts";
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('development defaults restrict both staff levels, keep recovery and preserve Supervisor/Partner access',()=>{
  const policy=access.defaultFeaturePolicy();
  for(const role of ['staff','leader'])for(const feature of ['operations','management','allocation'] as const)assert.equal(access.canUseFeature(role,policy,feature),false);
  for(const role of ['supervisor','partner','admin'])for(const [feature]of access.FEATURES)assert.equal(access.canUseFeature(role,policy,feature),true);
  assert.equal(access.canManageAccess('leader'),false);assert.equal(access.canManageAccess('staff'),false);
  assert.equal(access.allowedView('staff',policy,'matrix-view'),'my-work-view');
  assert.equal(access.canUseFeature('staff',policy,'profile'),true);
});
test('levels are independent; preview is usable, maintenance is blocked and invalid policies cannot save',()=>{
  const policy=access.defaultFeaturePolicy();policy.leader.operations={mode:'preview',message:'Under development'};
  assert.equal(access.canUseFeature('leader',policy,'operations'),true);assert.equal(access.canUseFeature('staff',policy,'operations'),false);
  policy.leader.operations.mode='maintenance';assert.match(access.requestAccessError('leader',policy,'/api/annual-sheet','POST')!,/Under development/);
  assert.equal(access.requestAccessError('supervisor',policy,'/api/annual-sheet','POST'),null);
  for(const mode of ['hidden','maintenance','preview']){const bad=structuredClone(policy) as any;bad.associate.profile.mode=mode;assert.throws(()=>access.parseFeaturePolicy(bad),/Profile/);}
  const bad=structuredClone(policy) as any;bad.associate.cases={mode:'preview',message:''};assert.throws(()=>access.parseFeaturePolicy(bad),/notice/);
  bad.associate.cases={mode:'enabled',message:'',execute:true};assert.throws(()=>access.parseFeaturePolicy(bad));
  bad.associate.cases={mode:'unknown',message:''};assert.throws(()=>access.parseFeaturePolicy(bad));
});
test('staff APIs cannot be unlocked by enabling Management and critical write routes are covered',()=>{
  const policy=access.defaultFeaturePolicy();policy.leader.management.mode='enabled';
  for(const path of ['/api/staff','/api/staff/someone','/api/feature-access'])assert.match(access.requestAccessError('leader',policy,path,'PUT')!,/Supervisor/);
  for(const path of ['/api/cases','/api/cases/workflow','/api/cases/report'])assert.equal(access.requiredRequestFeature(path,'POST'),'cases');
  for(const path of ['/api/operations','/api/monthly-claims','/api/annual-sheet'])assert.equal(access.requiredRequestFeature(path,'POST'),'operations');
  assert.equal(access.requiredRequestFeature('/api/clients/allocation','POST'),'allocation');
  assert.equal(access.requiredRequestFeature('/api/my-work','PATCH'),'myWork');
  assert.equal(access.requiredRequestFeature('/api/profile','POST'),null);
});
test('missing migration uses restrictive defaults; other database errors fail closed',async()=>{
  const result=await access.readFeatureSettings(mockDatabase({}));assert.equal(result.ready,false);assert.equal(result.policy.leader.operations.mode,'hidden');
  const bad={from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({error:{code:'57014'}})})};
  await assert.rejects(access.readFeatureSettings(bad),/verified/);
});
test('save API denies non-managers, validates before RPC, and preserves optimistic conflicts',async()=>{
  let role='leader',calls=0,conflict=false;
  const db:any={rpc:async(_name:string,args:any)=>{calls++;assert.equal(args.actor_id,'verified-actor');assert.equal(args.expected_version,3);return conflict?{error:{code:'40001'}}:{data:4};}};
  const route=loadRoute('app/api/feature-access/route.ts',{'@/lib/access':{currentActor:async()=>({profile:{id:'verified-actor',role},admin:db})}});
  const request=(policy:any=access.defaultFeaturePolicy())=>new Request('https://test.local/api/feature-access',{method:'PUT',body:JSON.stringify({version:3,policy,actorId:'forged'})});
  assert.equal((await route.PUT(request())).status,403);assert.equal(calls,0);
  role='supervisor';const invalid=access.defaultFeaturePolicy();invalid.associate.profile.mode='hidden';assert.equal((await route.PUT(request(invalid))).status,400);assert.equal(calls,0);
  const saved=await route.PUT(request());assert.equal(saved.status,200);assert.equal(saved.body.version,4);
  conflict=true;assert.equal((await route.PUT(request())).status,409);
});
test('annual full-screen handler enforces Operations even when bypassing middleware',async()=>{
  const db=mockDatabase({});
  const route=loadRoute('app/api/annual-sheet/route.ts',{'@/lib/access':{currentActor:async()=>({profile:{id:'p',role:'leader'},admin:db})},'@/lib/annual-sheet':{},'@/lib/annual-sheet-read':{}});
  const req=new Request('https://test.local/api/annual-sheet?team=accounting');assert.equal((await route.GET(req)).status,403);
  assert.equal((await route.POST(req)).status,403);assert.equal(db.tables.operational_workspace_state,undefined);
});
test('database guards are restrictive, audited atomically and unavailable to self-authorizing users',()=>{
  const sql=read('supabase/migrations/202611060001_feature_access_settings.sql');
  assert.match(sql,/as restrictive for all to authenticated/);assert.match(sql,/for update;/);assert.match(sql,/40001/);
  assert.match(sql,/insert into public.feature_access_audit/);assert.match(sql,/revoke all on function public.save_feature_access_settings.*from public, anon, authenticated/);
  assert.match(sql,/security invoker set search_path = ''/);assert.doesNotMatch(sql,/security definer|delete from|drop table|update public.staff_profiles/i);
});

function ui(role='staff'){
  const dom=new JSDOM('<button class="nav-btn" data-view="matrix-view"></button><button class="nav-btn" data-view="cases-view"></button><button data-management-tab="workload"></button><button data-management-tab="features"></button><div id="feature-notice-root"></div><div id="matrix-view"></div><div id="editor"></div>',{runScripts:'outside-only'}),w=dom.window as any;
  w.structuredClone=structuredClone;w.eval(read('public/feature-access.js'));
  let currentRole=role,policy=access.defaultFeaturePolicy(),version=1;const writes:any[]=[];
  const settings=()=>({policy,version,ready:true});
  const api=w.WorkspaceFeatures;const render=()=>{w.document.querySelector('#editor').innerHTML=api.editor();api.chrome('matrix-view');};
  api.init({role,offline:false,settings:settings(),changed:render,fetch:async(_url:string,init:any)=>{if(init?.method==='PUT'){writes.push(JSON.parse(init.body));return {ok:false,json:async()=>({error:'Conflict; reload'})};}return {ok:true,json:async()=>({...settings(),role:currentRole})};}});render();
  return {dom,w,api,writes,settings,render,setRole:(role:string)=>{currentRole=role;api.setRole(role);},setVersion:(next:number)=>{version=next;},policy};
}
test('menu UI hides unavailable menus, shows escaped preview notices and blocks maintenance content',()=>{
  const d=ui();try{
    assert.equal(d.w.document.querySelector('[data-view="matrix-view"]').hidden,true);
    assert.equal(d.w.document.querySelector('[data-management-tab="features"]').hidden,true);
    assert.equal(d.api.normalize('matrix-view'),'my-work-view');
    d.policy.associate.operations={mode:'preview',message:'<img src=x onerror=alert(1)> In progress'};d.api.accept(d.settings(),'staff');d.api.chrome('matrix-view');
    assert.equal(d.w.document.querySelector('[data-view="matrix-view"]').hidden,false);assert.match(d.w.document.querySelector('#feature-notice-root').textContent,/In progress/);assert.equal(d.w.document.querySelectorAll('img').length,0);
    d.policy.associate.operations.mode='maintenance';d.api.accept(d.settings(),'staff');assert.equal(d.api.normalize('matrix-view'),'matrix-view');assert.equal(d.api.blocked('matrix-view'),true);assert.match(d.w.document.querySelector('#matrix-view').textContent,/temporarily unavailable/);
    d.setRole('leader');assert.equal(d.api.manager(),false);assert.equal(d.api.editor(),'');
    d.setRole('supervisor');assert.equal(d.api.manager(),true);assert.equal(d.api.can('operations'),true);
    d.api.chrome('matrix-view');assert.equal(d.w.document.querySelector('[data-management-tab="features"]').hidden,false);
  }finally{d.dom.window.close();}
});
test('background policy refresh cannot advance the version of an unsaved settings draft',async()=>{
  const d=ui('supervisor');try{
    const input=d.w.document.querySelector('[data-feature-mode="operations"][data-feature-tier="associate"]');input.value='enabled';input.dispatchEvent(new d.w.Event('change',{bubbles:true}));
    d.setVersion(2);await d.api.refresh();d.w.document.querySelector('[data-feature-save]').click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(d.writes[0].version,1);assert.match(d.w.document.querySelector('[data-feature-save-status]').textContent,/Conflict/);
    assert.equal(d.w.document.querySelector('[data-feature-mode="operations"][data-feature-tier="associate"]').value,'enabled');
  }finally{d.dom.window.close();}
});
