import assert from "node:assert/strict";
import test from "node:test";
import { defaultFeaturePolicy } from "../lib/feature-access.ts";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";

const clientId = "10000000-0000-0000-0000-000000000001";
const year = 2026;
function setup() {
  const profile = {id:"supervisor",role:"supervisor",display_name:"Lead",full_name:"Lead"};
  const policy = defaultFeaturePolicy();
  const db = mockDatabase({
    allocation_draft_revisions:[],
    feature_access_settings:[{id:true,version:1,policy}],
    client_master:[{id:clientId,client_code:"CL-001",legal_name:"Client one",status:"Active",tax_pic_name:"Saved Tax"}],
    staff_profiles:[{id:"tax-pic",display_name:"Tax PIC",full_name:"Tax PIC",team_division:"Tax Team",directory_active:true}]
  });
  const route = loadRoute("app/api/clients/allocation/draft/route.ts",{"@/lib/access":{
    currentActor:async()=>({profile,admin:db}),
    isLeadership:(role:string)=>["supervisor","partner","admin","leader"].includes(role)
  }});
  return {profile,policy,db,route,read:(selectedYear=year)=>route.GET(request({},`?year=${selectedYear}`)),
    publish:(changes:unknown[],expectedVersion=0)=>route.POST(request({year,expectedVersion,changes}))};
}

test("shared drafts are year-scoped and retain partial proposals and No PIC without changing assignments",async()=>{
  const d = setup();
  const before = structuredClone(d.db.tables.client_master);
  assert.equal((await d.read()).body.draft,null);
  const published = await d.publish([{clientId,nextAccPic:"",nextTaxPic:" tax  pic "}]);
  assert.equal(published.status,201);
  assert.deepEqual(published.body.draft.changes,[{clientId,clientCode:"CL-001",clientName:"Client one",nextAccPic:"",nextAccPicId:null,nextTaxPic:"Tax PIC",nextTaxPicId:"tax-pic"}]);
  assert.equal((await d.read(2027)).body.draft,null);
  const conflict = await d.publish([{clientId,nextTaxPic:""}],0);
  assert.equal(conflict.status,409);
  assert.equal((await d.publish([],1)).status,201);
  assert.equal(d.db.tables.allocation_draft_revisions.length,2,"withdrawing retains the first version for audit");
  assert.deepEqual(d.db.tables.client_master,before);
});

test("leaders with Allocation can read, Associates and restricted leaders cannot, and only managers publish",async()=>{
  const d = setup();
  d.profile.role = "staff";
  assert.equal((await d.read()).status,403);
  d.profile.role = "leader";
  assert.equal((await d.read()).status,403);
  d.policy.leader.allocation.mode = "enabled";
  assert.equal((await d.read()).status,200);
  assert.equal((await d.publish([{clientId,nextTaxPic:""}])).status,403);
  assert.equal(d.db.tables.allocation_draft_revisions.length,0);
});

test("publishing rejects wrong teams, duplicate rows and inactive clients without partial saves",async()=>{
  const d = setup();
  assert.equal((await d.publish([{clientId,nextAccPic:"Tax PIC"}])).status,422);
  assert.equal((await d.publish([{clientId,nextTaxPic:""},{clientId,nextAccPic:""}])).status,400);
  d.db.tables.client_master[0].status = "Inactive";
  assert.equal((await d.publish([{clientId,nextTaxPic:""}])).status,422);
  assert.equal(d.db.tables.allocation_draft_revisions.length,0);
});
