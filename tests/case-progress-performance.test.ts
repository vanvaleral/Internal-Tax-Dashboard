import assert from "node:assert/strict";
import test from "node:test";
import { applyCaseProgressPage, caseProgressPage, parseCaseProgressPage } from "../lib/case-progress-page.ts";
import { defaultFeaturePolicy } from "../lib/feature-access.ts";
import { loadRoute, mockDatabase } from "./route-harness.ts";

const id = "00000000-0000-4000-8000-000000000001";
const at = "2026-11-06T08:00:00.123456+00:00";
test("history cursor preserves microseconds, rejects injected filters and bounds page sizes", () => {
  const page = parseCaseProgressPage(new URLSearchParams({ cursor:JSON.stringify({progressEntries:{at,id}}) }));
  assert.equal(page.cursor.progressEntries && page.cursor.progressEntries.at, at);
  assert.equal(page.cursor.completedTasks, null); assert.equal(page.limit,25);
  for (const input of ["null", "[]", '{"other":false}', JSON.stringify({progressEntries:{at:`${at},id.neq.x`,id}}), JSON.stringify({progressEntries:{at,id:"bad"}})]) {
    assert.throws(()=>parseCaseProgressPage(new URLSearchParams({cursor:input})));
  }
  for (const limit of ["0","101","1.5","no"]) assert.throws(()=>parseCaseProgressPage(new URLSearchParams({limit})));
  const rows = [{id,created_at:at},{id:"next",created_at:at}];
  const result = caseProgressPage(rows,"created_at",1);
  assert.deepEqual(result.data,[rows[0]]); assert.deepEqual(result.cursor,{at,id});
  assert.equal(caseProgressPage([],"created_at",25).cursor,false);
});

test("history pages use stable timestamp/ID keysets, including legacy null timestamps", async () => {
  const calls:any[]=[];
  const query:any={}; for(const key of ["or","is","lt","order","limit"]) query[key]=(...args:any[])=>{calls.push([key,...args]);return query;};
  applyCaseProgressPage(query,"created_at",{at,id},25);
  assert.deepEqual(calls,[['or',`created_at.lt.${at},created_at.is.null,and(created_at.eq.${at},id.lt.${id})`],['order','created_at',{ascending:false,nullsFirst:false}],['order','id',{ascending:false}],['limit',26]]);
  calls.length=0;applyCaseProgressPage(query,"completed_at",{at:null,id},25);
  assert.deepEqual(calls.slice(0,2),[['is','completed_at',null],['lt','id',id]]);
  calls.length=0;assert.deepEqual(await applyCaseProgressPage(query,"created_at",false,25),{data:[],error:null});assert.equal(calls.length,0);
});

function accessFixture() {
  const policy=defaultFeaturePolicy();
  const db=mockDatabase({staff_profiles:[{id:"tax",auth_user_id:"user",role:"staff",directory_active:true}],feature_access_settings:[{id:true,version:1,policy}],tax_cases:[{id,tax_pic_profile_id:"tax",accounting_pic_profile_id:null}],my_work_tasks:[],tax_case_progress_entries:[],tax_case_task_timeline:[]});
  let user:any={id:"user"},authReads=0;
  const access=loadRoute("lib/access.ts",{
    "@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>{authReads++;return {data:{user}};}}})},
    "@/lib/supabase/admin":{createAdminClient:()=>db},"@/lib/staff-directory":{canImportClientMaster:()=>false}
  });
  const route=loadRoute("app/api/cases/route.ts",{"@/lib/access":access,"@/lib/notifications":{},"@/lib/operational-rules":{}});
  const req=(expected="user",search="")=>({headers:new Headers({"x-workspace-user":expected}),nextUrl:new URL(`https://test.local/api/cases?progressFor=${id}${search}`)});
  return {db,policy,route,req,setUser:(value:any)=>{user=value;},authReads:()=>authReads};
}
test("Cases authenticate once per request and retain fresh account, role, feature and PIC checks", async()=>{
  const d=accessFixture();
  assert.equal((await d.route.GET(d.req())).status,200);assert.equal(d.authReads(),1);
  assert.equal((await d.route.GET(d.req("another-user"))).status,409);
  d.db.tables.staff_profiles[0].directory_active=false;assert.equal((await d.route.GET(d.req())).status,403);
  d.db.tables.staff_profiles[0].directory_active=true;
  d.policy.associate.cases={mode:"hidden",message:""};assert.equal((await d.route.GET(d.req())).status,403);
  d.policy.associate.cases={mode:"maintenance",message:"Maintenance"};assert.equal((await d.route.GET(d.req())).status,403);
  d.policy.associate.cases={mode:"enabled",message:""};d.db.tables.tax_cases[0].tax_pic_profile_id="other";
  assert.equal((await d.route.GET(d.req())).status,403);
  d.db.tables.staff_profiles[0].role="supervisor";assert.equal((await d.route.GET(d.req())).status,200);
  d.setUser(null);assert.equal((await d.route.GET(d.req())).status,401);
  assert.equal(d.authReads(),8);
});

test("every Cases HTTP handler invokes the shared authorization guard before data reads",async()=>{
  for(const file of ["app/api/cases/route.ts","app/api/cases/workflow/route.ts","app/api/cases/report/route.ts"]){
    let checks=0;
    const bindings:any={"@/lib/case-access":{currentCaseActor:async()=>{checks++;return {error:"Denied",status:403};}},"@/lib/access":{},"@/lib/notifications":{},"@/lib/operational-rules":{},"@/lib/case-workflow":{},"@/lib/case-report-progress":{}};
    const route=loadRoute(file,bindings);
    for(const method of ["GET","POST","PATCH","DELETE"]) if(route[method]) assert.equal((await route[method]({})).status,403,`${file} ${method}`);
    assert.ok(checks>0);
  }
});

test("case list and paged timeline expose numeric auth/data timings without caching private records",async()=>{
  const d=accessFixture();
  for(const search of ["",`?progressFor=${id}&historyPage=1`]){
    const response=await d.route.GET({headers:new Headers({'x-workspace-user':'user'}),nextUrl:new URL(`https://test.local/api/cases${search}`)});
    assert.equal(response.status,200);assert.equal(response.headers['Cache-Control'],'private, no-store');assert.match(response.headers['Server-Timing'],/^auth;dur=\d+,data;dur=\d+$/);
  }
});
