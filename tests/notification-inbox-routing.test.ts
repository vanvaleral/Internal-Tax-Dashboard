import assert from "node:assert/strict";
import test from "node:test";
import { notificationEventKey, uniqueProfileIds } from "../lib/operational-rules.ts";
import { loadRoute, mockDatabase } from "./route-harness.ts";

test("recipient-scoped inbox resolves the author's name and excludes PIC Access alerts for Associates",async()=>{
  const viewer = {id:"recipient",auth_user_id:"viewer",role:"staff",display_name:"Viewer",directory_active:true};
  const notice = (id:string,source_type:string,sender_profile_id:string|null) =>
    ({id,source_type,sender_profile_id,title:id,message:"Test",audience:"all"});
  const session = mockDatabase({
    staff_profiles:[viewer],
    announcement_recipients:[
      {staff_profile_id:viewer.id,announcements:notice("new case","tax_case","creator")},
      {staff_profile_id:viewer.id,announcements:notice("staff access","staff_directory","manager")},
      {staff_profile_id:viewer.id,announcements:notice("automated reminder","reminder",null)},
      {staff_profile_id:"another recipient",announcements:notice("other case","tax_case","other-creator")}
    ], announcement_recipient_trash:[]
  });
  const queried: string[] = [];
  const admin = mockDatabase({staff_profiles:[{id:"creator",display_name:"Case creator"},{id:"manager",full_name:"PIC manager"}]});
  const route = loadRoute("app/api/announcements/route.ts",{
    "@/lib/notifications":{},
    "@/lib/supabase/server":{createClient:async()=>({...session,auth:{getUser:async()=>({data:{user:{id:"viewer"}}})}})},
    "@/lib/supabase/admin":{createAdminClient:()=>({from:(table:string)=>{
      assert.equal(table,"staff_profiles");
      const query = admin.from(table), selectIn = query.in;
      query.in = (key:string,ids:string[]) => {queried.push(...ids);return selectIn(key,ids);};
      return query;
    }})}
  });
  const read = (deleted = false) => route.GET({nextUrl:new URL(`http://test.local/api/announcements?deleted=${deleted ? 1 : 0}`)});
  const inbox = await read();
  assert.deepEqual(Array.from(inbox.body.announcements,(item:any)=>[item.title,item.sender]),[["new case","Case creator"],["automated reminder","System"]]);
  assert.deepEqual(queried,["creator"],"do not resolve names from unauthorized items");
  session.tables.announcement_recipient_trash.push({staff_profile_id:viewer.id,announcement_id:"staff access",deleted_at:"2026-11-20T00:00:00Z"});
  assert.equal((await read(true)).body.announcements.length,0);
  viewer.role = "leader";
  const [staffNotice] = (await read(true)).body.announcements;
  assert.equal(staffNotice.sender,"PIC manager");
  assert.equal(staffNotice.audience,"leadership");
});

test("PIC Access notifications never fall back to a broadcast and deliver only to eligible active roles",async()=>{
  const db = mockDatabase({staff_profiles:[
    {id:"one",role:"staff",directory_active:true},{id:"lead",role:"leader",directory_active:true},
    {id:"boss",role:"supervisor",directory_active:true},{id:"former",role:"partner",directory_active:false}
  ]});
  const calls: any[] = [];
  db.rpc = async (_name,args) => {calls.push(args);return {data:{id:"announcement-1"},error:null};};
  const {createOperationalAnnouncement} = loadRoute("lib/notifications.ts",{
    "@/lib/supabase/admin":{createAdminClient:()=>db},
    "@/lib/operational-rules":{notificationEventKey,uniqueProfileIds}, "@/lib/web-push":{}, "web-push":{}
  });
  const notice = {sourceType:"staff_directory",title:"PIC Access",message:"Changed",senderProfileId:"boss"};
  await assert.rejects(createOperationalAnnouncement({...notice,recipientProfileIds:[]}),/No notification recipients/);
  await assert.rejects(createOperationalAnnouncement({...notice,recipientProfileIds:["one"]}),/No active notification recipients/);
  await createOperationalAnnouncement({...notice,recipientProfileIds:["one","lead","boss","former"]});
  assert.deepEqual(Array.from(calls[0].p_recipient_profile_ids),["lead","boss"]);
  await createOperationalAnnouncement({...notice,sourceType:"tax_case",recipientProfileIds:["one","lead"]});
  assert.deepEqual(Array.from(calls[1].p_recipient_profile_ids),["one","lead"]);
});
