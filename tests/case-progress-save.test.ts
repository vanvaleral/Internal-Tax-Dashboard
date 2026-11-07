import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {loadRoute,mockDatabase,request} from './route-harness.ts';
const id='00000000-0000-4000-8000-000000000001',entryId='00000000-0000-4000-8000-000000000002';
function fixture(){
  const db=mockDatabase({tax_cases:[{id,tax_pic_profile_id:'pic',deleted_at:null}],tax_case_progress_entries:[]});
  const calls:any[]=[];let error:any=null;
  db.rpc=async(name,args)=>{calls.push({name,args});return error?{data:null,error}:{data:{id:entryId,entry:args.p_entry,creatorName:'PIC',createdAt:'2026-11-07T04:00:00Z'},error:null};};
  const route=loadRoute('app/api/cases/route.ts',{'@/lib/access':{currentActor:async()=>({profile:{id:'pic',role:'supervisor',display_name:'PIC'},admin:db}),isLeadership:()=>true},'@/lib/notifications':{},'@/lib/operational-rules':{}});
  return {db,calls,post:(extra:any={})=>route.PATCH(request({id,entryId,action:'add-progress',entry:'Saved follow-up',...extra})),error:(value:any)=>{error=value;}};
}
test('follow-up fast path uses one atomic RPC and the server actor, with no duplicate ownership read or insert',async()=>{
  const d=fixture();let reads=0;const from=d.db.from.bind(d.db);d.db.from=(table:string)=>{reads++;return from(table);};
  const response=await d.post({p_actor_profile_id:'spoofed'});assert.equal(response.status,200);assert.equal(reads,0);assert.equal(d.calls.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(d.calls[0])),{name:'save_case_progress_fast',args:{p_case_id:id,p_actor_profile_id:'pic',p_entry:'Saved follow-up',p_entry_id:entryId}});
  assert.equal(d.db.tables.tax_case_progress_entries.length,0);assert.equal(response.body.progressEntry.id,entryId);
});
test('only a missing function permits legacy fallback; denial, content conflict and uncertain failures never insert again',async()=>{
  for(const [code,status] of [['42501',403],['22023',400],['57014',503],['08006',503]]){
    const d=fixture();d.error({code,message:'Synthetic failure'});assert.equal((await d.post()).status,status);assert.equal(d.db.tables.tax_case_progress_entries.length,0);
  }
  const old=fixture();old.error({code:'PGRST202'});const response=await old.post();assert.equal(response.status,200);assert.equal(old.db.tables.tax_case_progress_entries[0].id,entryId);
  assert.equal((await old.post()).status,200);assert.equal(old.db.tables.tax_case_progress_entries.length,1);
});
test('invalid entries and retry IDs are rejected before any RPC',async()=>{
  for(const extra of [{entryId:'bad'},{entry:''},{entry:'x'.repeat(1001)}]){const d=fixture();assert.equal((await d.post(extra)).status,400);assert.equal(d.calls.length,0);}
});
test('migration preserves history, locks current actor/case, restricts execution and replays immutable request IDs',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261107031759_fast_case_progress_save.sql',import.meta.url),'utf8');
  assert.match(sql,/security invoker set search_path = ''/);assert.doesNotMatch(sql,/security definer|delete from|alter table|update public|drop /i);
  assert.match(sql,/directory_active = true for share/);assert.match(sql,/deleted_at is null for share/);assert.match(sql,/on conflict\(id\) do nothing/);
  assert.match(sql,/v_saved\.entry is distinct from btrim\(p_entry\)/);assert.match(sql,/from public,anon,authenticated/);assert.match(sql,/to service_role/);
});
