import assert from "node:assert/strict";
import test from "node:test";
import {createClient} from "@supabase/supabase-js";
import {withCaseActivity} from "../lib/case-activity.ts";
import {loadRoute} from "./route-harness.ts";

test('activity combines all sources and separately retains the current PIC last contribution',()=>{
  const row={id:'case',created_at:'2026-01-01',updated_at:'2026-02-01',updated_by_profile_id:'other',
    latest_followup:[{created_at:'2026-10-01'}],latest_task:[{occurred_at:'2026-11-01'}],latest_completion:[{completed_at:'2026-10-15'}],
    my_followup:[{created_at:'2026-09-01'}],my_task:[{occurred_at:'2026-08-01'}],my_completion:[],case_workflow:{events:[{at:'2026-10-02',actorId:'pic'}]}};
  const output=withCaseActivity(row,'pic','user');
  assert.equal(output.last_activity_at,'2026-11-01');assert.equal(output.my_last_activity_at,'2026-10-02');assert.equal(output.activity_available,true);
  assert.equal('latest_task' in output,false);assert.equal('my_followup' in output,false);assert.ok(row.latest_task);
  assert.equal(withCaseActivity({created_at:'bad',updated_at:null},'pic','user').last_activity_at,null);
});

test('activity query limits every embedded source to one timestamp, retains PIC scoping and does not return histories',async()=>{
  const urls:URL[]=[];const client=createClient('https://example.invalid','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any)=>{
    urls.push(new URL(String(input)));return new Response(JSON.stringify([{id:'case',updated_at:'2026-10-01',latest_followup:[{created_at:'2026-11-01'}]}]),{headers:{'Content-Type':'application/json'}});
  }}});
  const reads=loadRoute('lib/workspace-reads.ts',{'@/lib/access':{isLeadership:()=>false}});
  const result=await reads.readCases({admin:client,profile:{id:'pic',role:'staff'},userId:'user'});
  const query=urls[0].searchParams;assert.equal(urls.length,1);assert.match(query.get('or') || '',/tax_pic_profile_id.eq.pic,accounting_pic_profile_id.eq.pic/);
  for(const alias of ['latest_followup','latest_task','latest_completion','my_followup','my_task','my_completion'])assert.equal(query.get(`${alias}.limit`),'1');
  assert.equal(query.get('limit'),null);assert.equal(query.get('my_followup.created_by_profile_id'),'eq.pic');assert.equal(query.get('my_task.actor_profile_id'),'eq.pic');
  assert.equal(query.get('latest_completion.is_completed'),'eq.true');assert.equal(result.data[0].last_activity_at,'2026-11-01');assert.equal(result.data[0].latest_followup,undefined);
});

test('missing activity schema falls back to scoped rows without guessing age; permission errors never fall back',async()=>{
  for(const code of ['PGRST200','42501']){
    const urls:URL[]=[];const client=createClient('https://example.invalid','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any)=>{
      urls.push(new URL(String(input)));return urls.length===1?new Response(JSON.stringify({code,message:'Synthetic error'}),{status:400,headers:{'Content-Type':'application/json'}}):new Response(JSON.stringify([{id:'case'}]),{headers:{'Content-Type':'application/json'}});
    }}});
    const reads=loadRoute('lib/workspace-reads.ts',{'@/lib/access':{isLeadership:()=>false}}),actor={admin:client,profile:{id:'pic',role:'staff'},userId:'user'};
    if(code==='42501'){await assert.rejects(reads.readCases(actor),/Synthetic error/);assert.equal(urls.length,1);}
    else{const result=await reads.readCases(actor);assert.equal(result.data[0].activity_available,false);assert.equal(urls.length,2);assert.match(urls[1].searchParams.get('or') || '',/pic/);}
  }
});
